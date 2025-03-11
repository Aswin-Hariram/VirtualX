export class SDPUtils {
  constructor() {
    this.mediaRegex = /m=([^\s]+)\s+/;
    this.codecPreferences = {
      video: ['VP9', 'H264', 'VP8'],
      audio: ['opus', 'G722', 'PCMU', 'PCMA']
    };
  }

  setVideoBitrates(sdp, bitrates) {
    if (!bitrates || !sdp) return sdp;

    let lines = sdp.split('\n');
    let mediaSection = false;
    let videoSection = false;

    // Remove existing bitrate constraints
    lines = lines.filter(line => !line.startsWith('b=AS:') && !line.startsWith('b=TIAS:'));

    // Add new bitrate constraints
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith('m=')) {
        mediaSection = true;
        videoSection = lines[i].startsWith('m=video');
        
        if (videoSection) {
          // Add enhanced video constraints
          lines.splice(i + 1, 0, 
            `b=AS:${bitrates.max}`,
            `b=TIAS:${bitrates.max * 1000}`,
            'a=content:main',
            'a=quality:10.0',
            'a=setup:actpass',
            'a=priority:high',
            'a=x-google-start-bitrate:4000',
            'a=x-google-min-bitrate:2500',
            'a=x-google-max-bitrate:8000'
          );
          i += 9;
        }
      }

      if (!mediaSection || !videoSection) continue;

      // Add specific codec parameters for better quality
      if (lines[i].includes('VP9')) {
        lines.splice(i + 1, 0,
          'a=fmtp:96 profile-id=2 x-google-max-framerate=60 x-google-min-framerate=30'
        );
        i++;
      } else if (lines[i].includes('H264')) {
        lines.splice(i + 1, 0,
          'a=fmtp:97 level-asymmetry-allowed=1;packetization-mode=1;profile-level-id=42e01f;max-fr=60;max-fs=8160'
        );
        i++;
      }
    }

    return lines.join('\n');
  }

  setAudioBitrate(sdp, bitrate) {
    if (!bitrate || !sdp) return sdp;

    let lines = sdp.split('\n');
    let mediaSection = false;
    let audioSection = false;

    // Remove existing audio bitrate constraints
    lines = lines.filter(line => !line.startsWith('b=AS:') && !line.startsWith('b=TIAS:'));

    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith('m=')) {
        mediaSection = true;
        audioSection = lines[i].startsWith('m=audio');
        
        if (audioSection) {
          // Add enhanced audio constraints
          lines.splice(i + 1, 0,
            `b=AS:${bitrate}`,
            `b=TIAS:${bitrate * 1000}`,
            'a=quality:10.0',
            'a=setup:actpass',
            'a=priority:high',
            'a=x-google-start-bitrate:256',
            'a=x-google-min-bitrate:128',
            'a=x-google-max-bitrate:510'
          );
          i += 8;
        }
      }

      if (!mediaSection || !audioSection) continue;

      // Add specific codec parameters for better audio quality
      if (lines[i].includes('opus')) {
        lines.splice(i + 1, 0,
          'a=fmtp:111 minptime=10;useinbandfec=1;stereo=1;maxplaybackrate=48000;sprop-maxcapturerate=48000;maxaveragebitrate=510000'
        );
        i++;
      }
    }

    return lines.join('\n');
  }

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
        
        if (videoSection) {
          newLines.push(
            'a=content:main',
            'a=quality:10.0',
            'a=setup:actpass',
            'a=priority:high',
            'a=x-google-cpu-overuse-detection:true',
            'a=x-google-max-bandwidth-stats:true',
            'a=x-google-min-bitrate:2500',
            'a=x-google-start-bitrate:4000',
            'a=x-google-max-bitrate:8000'
          );
        }
      }

      if (!mediaSection || !videoSection) continue;

      // Enhanced codec-specific parameters
      if (lines[i].includes('VP9')) {
        newLines.push(
          'a=fmtp:96 profile-id=2 x-google-max-framerate=60 x-google-min-framerate=30'
        );
      } else if (lines[i].includes('H264')) {
        newLines.push(
          'a=fmtp:97 level-asymmetry-allowed=1;packetization-mode=1;profile-level-id=42e01f;max-fr=60;max-fs=8160'
        );
      }
    }

    return newLines.join('\n');
  }

  preferHighQualityCodecs(sdp) {
    const lines = sdp.split('\n');
    const newLines = [];
    let mediaSection = '';

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      if (line.startsWith('m=')) {
        mediaSection = line.split(' ')[0].substring(2);
        const parts = line.split(' ');
        const payloadTypes = parts.slice(3);
        
        // Reorder payload types based on codec preferences
        if (this.codecPreferences[mediaSection]) {
          const orderedPayloadTypes = [];
          
          // First add preferred codecs in order
          this.codecPreferences[mediaSection].forEach(codec => {
            const codecIndex = lines.findIndex(l => 
              l.startsWith('a=rtpmap:') && 
              l.toLowerCase().includes(codec.toLowerCase())
            );
            
            if (codecIndex !== -1) {
              const pt = lines[codecIndex].split(':')[1].split(' ')[0];
              if (payloadTypes.includes(pt)) {
                orderedPayloadTypes.push(pt);
              }
            }
          });
          
          // Then add remaining codecs
          payloadTypes.forEach(pt => {
            if (!orderedPayloadTypes.includes(pt)) {
              orderedPayloadTypes.push(pt);
            }
          });
          
          // Update the media line with reordered payload types
          parts.splice(3, parts.length - 3, ...orderedPayloadTypes);
          newLines.push(parts.join(' '));
          continue;
        }
      }
      
      newLines.push(line);
    }

    return newLines.join('\n');
  }
}

// Export a singleton instance
export const sdpUtils = new SDPUtils(); 