import ffmpeg from 'fluent-ffmpeg';
import { parseFile } from 'music-metadata';
import { writeFileSync, mkdirSync } from 'fs';
import path from 'path';

const PROCESSED_DIR = process.env.PROCESSED_DIR || './processed';
const WAVEFORM_PEAKS = 200;
const WAVEFORM_SAMPLE_RATE = 8000;

export async function extractMetadata(filePath) {
  const meta = await parseFile(filePath, { duration: true });
  const { format, common } = meta;
  return {
    title: common.title || null,
    artist: common.artist || null,
    album: common.album || null,
    genre: common.genre?.[0] || null,
    year: common.year || null,
    sample_rate: format.sampleRate || null,
    bit_depth: format.bitsPerSample || null,
    channels: format.numberOfChannels || null,
    bitrate: format.bitrate ? Math.round(format.bitrate) : null,
    duration_seconds: format.duration || null,
    codec: format.codec || null,
    original_format: format.container || path.extname(filePath).slice(1).toUpperCase(),
  };
}

export function transcodeToOpus(inputPath, trackId) {
  const outDir = path.join(PROCESSED_DIR, trackId);
  mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'stream.ogg');
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .audioCodec('libopus')
      .audioBitrate('320k')
      .audioChannels(2)
      .outputOptions(['-vbr', 'on', '-compression_level', '10'])
      .output(outPath)
      .on('end', function() { resolve(outPath); })
      .on('error', reject)
      .run();
  });
}

// Decodes to raw mono PCM at a low sample rate — plenty of resolution for
// peak-based waveform display, far cheaper than analyzing the full-rate signal.
function decodeToMonoPcm(filePath) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    ffmpeg(filePath)
      .audioChannels(1)
      .audioFrequency(WAVEFORM_SAMPLE_RATE)
      .format('s16le')
      .on('error', reject)
      .pipe()
      .on('data', (chunk) => chunks.push(chunk))
      .on('end', () => resolve(Buffer.concat(chunks)))
      .on('error', reject);
  });
}

function extractPeaks(pcm, numPeaks = WAVEFORM_PEAKS) {
  const totalSamples = Math.floor(pcm.length / 2);
  const peaks = new Array(numPeaks).fill(0);
  if (totalSamples === 0) return peaks;
  const samplesPerBucket = totalSamples / numPeaks;
  for (let i = 0; i < numPeaks; i++) {
    const start = Math.floor(i * samplesPerBucket);
    const end = Math.max(start + 1, Math.min(totalSamples, Math.floor((i + 1) * samplesPerBucket)));
    let max = 0;
    for (let j = start; j < end; j++) {
      const sample = Math.abs(pcm.readInt16LE(j * 2));
      if (sample > max) max = sample;
    }
    peaks[i] = Math.round((max / 32768) * 1000) / 1000;
  }
  return peaks;
}

export async function extractWaveformPeaks(filePath) {
  const pcm = await decodeToMonoPcm(filePath);
  return extractPeaks(pcm);
}

// EBU R128 loudness via ffmpeg's built-in ebur128 filter — framelog=quiet
// suppresses its per-frame log spam, leaving just the final Summary block.
export function computeLoudness(filePath) {
  return new Promise((resolve) => {
    let stderr = '';
    ffmpeg(filePath)
      .audioFilters('ebur128=peak=true:framelog=quiet')
      .format('null')
      .output('-')
      .on('stderr', (line) => { stderr += line + '\n'; })
      .on('end', () => resolve(parseLoudness(stderr)))
      .on('error', () => resolve({ lufs_integrated: null, lufs_true_peak: null }))
      .run();
  });
}

function parseLoudness(stderr) {
  const integrated = stderr.match(/Integrated loudness:\s*\n\s*I:\s*(-?\d+\.?\d*)\s*LUFS/);
  const truePeak = stderr.match(/True peak:\s*\n\s*Peak:\s*(-?\d+\.?\d*)\s*dBFS/);
  return {
    lufs_integrated: integrated ? parseFloat(integrated[1]) : null,
    lufs_true_peak: truePeak ? parseFloat(truePeak[1]) : null,
  };
}

export async function processTrack(filePath, trackId) {
  console.log(`Processing ${trackId}...`);
  const [metadata, opusPath, waveformData, loudness] = await Promise.all([
    extractMetadata(filePath),
    transcodeToOpus(filePath, trackId),
    extractWaveformPeaks(filePath),
    computeLoudness(filePath),
  ]);
  const outDir = path.join(PROCESSED_DIR, trackId);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(path.join(outDir, 'waveform.json'), JSON.stringify(waveformData));
  console.log(`Done ${trackId}: ${metadata.codec} ${metadata.sample_rate}Hz, ${loudness.lufs_integrated ?? '?'} LUFS`);
  return { metadata, opusPath, waveformData, loudness };
}
