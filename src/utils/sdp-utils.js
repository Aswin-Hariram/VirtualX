export class SDPUtils {
  constructor() {
    this.mediaRegex = /m=([^\s]+)\s+/;
  }

  setVideoBitrates(sdp, bitrates) {
    if (!bitrates || !sdp) return sdp;

    let lines = sdp.split('\n');
    let mediaSection = false;
    let videoSection = false;

    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith('m=')) {
        mediaSection = true;
        videoSection = lines[i].startsWith('m=video');
        continue;
      }

      if (!mediaSection || !videoSection) continue;

      // If we're in a video section and find a b= line, remove it
      if (lines[i].startsWith('b=')) {
        lines.splice(i, 1);
        i--;
        continue;
      }

      // If we hit the next media section, we're done with video
      if (mediaSection && lines[i].startsWith('m=')) {
        break;
      }
    }

    // Find the video section again and add our bitrate lines
    mediaSection = false;
    videoSection = false;

    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith('m=')) {
        mediaSection = true;
        videoSection = lines[i].startsWith('m=video');
        
        if (videoSection) {
          // Add bitrate lines after the media line
          if (bitrates.min) {
            lines.splice(i + 1, 0, `b=AS:${bitrates.min}`);
            i++;
          }
          if (bitrates.max) {
            lines.splice(i + 1, 0, `b=TIAS:${bitrates.max * 1000}`);
            i++;
          }
          break;
        }
      }
    }

    return lines.join('\n');
  }

  setAudioBitrate(sdp, bitrate) {
    if (!bitrate || !sdp) return sdp;

    let lines = sdp.split('\n');
    let mediaSection = false;
    let audioSection = false;

    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith('m=')) {
        mediaSection = true;
        audioSection = lines[i].startsWith('m=audio');
        continue;
      }

      if (!mediaSection || !audioSection) continue;

      // If we're in an audio section and find a b= line, remove it
      if (lines[i].startsWith('b=')) {
        lines.splice(i, 1);
        i--;
        continue;
      }

      // If we hit the next media section, we're done with audio
      if (mediaSection && lines[i].startsWith('m=')) {
        break;
      }
    }

    // Find the audio section again and add our bitrate line
    mediaSection = false;
    audioSection = false;

    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith('m=')) {
        mediaSection = true;
        audioSection = lines[i].startsWith('m=audio');
        
        if (audioSection) {
          // Add bitrate line after the media line
          lines.splice(i + 1, 0, `b=AS:${bitrate}`);
          break;
        }
      }
    }

    return lines.join('\n');
  }

  // Add FMTP parameters for better quality
  addQualityParameters(sdp) {
    const lines = sdp.split('\n');
    const newLines = [];
    let mediaSection = false;
    let videoSection = false;

    for (let i = 0; i < lines.length; i++) {
      newLines.push(lines[i]);

      if (lines[i].startsWith('m=')) {
        mediaSection = true;
        videoSection = lines[i].startsWith('m=video');
        continue;
      }

      if (!mediaSection || !videoSection) continue;

      // If we find an a=fmtp: line for VP8/VP9/H264, add quality parameters
      if (lines[i].startsWith('a=fmtp:')) {
        if (lines[i].includes('VP8') || lines[i].includes('VP9')) {
          newLines.push('a=fmtp:96 x-google-min-bitrate=1000;x-google-max-bitrate=3500;x-google-start-bitrate=2500');
        } else if (lines[i].includes('H264')) {
          newLines.push('a=fmtp:97 level-asymmetry-allowed=1;packetization-mode=1;profile-level-id=42e01f');
        }
      }
    }

    return newLines.join('\n');
  }

  // Modify SDP to prioritize quality codecs
  preferHighQualityCodecs(sdp) {
    const lines = sdp.split('\n');
    const newLines = [];
    let mediaSection = false;
    let videoSection = false;

    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith('m=')) {
        mediaSection = true;
        videoSection = lines[i].startsWith('m=video');
        
        if (videoSection) {
          // Modify the m= line to prioritize H264 and VP9
          const parts = lines[i].split(' ');
          const payloadTypes = parts.slice(3);
          const h264Index = payloadTypes.findIndex(pt => {
            const rtpmapLine = lines.find(l => l.includes(`a=rtpmap:${pt} H264`));
            return rtpmapLine !== undefined;
          });
          
          if (h264Index !== -1) {
            const h264PT = payloadTypes[h264Index];
            payloadTypes.splice(h264Index, 1);
            payloadTypes.unshift(h264PT);
            parts.splice(3, parts.length - 3, ...payloadTypes);
            lines[i] = parts.join(' ');
          }
        }
      }
      
      newLines.push(lines[i]);
    }

    return newLines.join('\n');
  }
}

// Export a singleton instance
export const sdpUtils = new SDPUtils(); 