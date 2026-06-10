import { createClient, RealtimeChannel } from '@supabase/supabase-js';

// Get Supabase credentials
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

// Initialize Supabase only if we have the credentials
const supabase = (supabaseUrl && supabaseAnonKey) 
  ? createClient(supabaseUrl, supabaseAnonKey) 
  : null;

export type PeerConnectionStatus = 'disconnected' | 'connecting' | 'connected';

export interface FileMetadata {
  name: string;
  size: number;
  type: string;
}

export interface ProgressData {
  fileName: string;
  progress: number;
}

export class P2PConnection {
  private peerConnection: RTCPeerConnection | null = null;
  private dataChannel: RTCDataChannel | null = null;
  private roomId: string | null = null;
  private channel: RealtimeChannel | null = null;
  private isHost: boolean = false;
  
  public onStatusChange: (status: PeerConnectionStatus) => void = () => {};
  public onReceiveMessage: (msg: string) => void = () => {};
  public onFileTransferStart: (metadata: FileMetadata) => void = () => {};
  public onFileTransferProgress: (progress: ProgressData) => void = () => {};
  public onFileTransferComplete: (fileUrl: string, fileName: string) => void = () => {};
  
  // File transfer states
  private incomingFileInfo: FileMetadata | null = null;
  private incomingFileData: ArrayBuffer[] = [];
  private receivedSize = 0;
  private isReceivingFile = false;

  constructor() {
    if (!supabase) {
      console.warn('Supabase URL or Anon Key is missing. P2P signaling will not work.');
    }
  }

  private createPeerConnection() {
    const configuration = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:global.stun.twilio.com:3478' }
      ]
    };
    
    this.peerConnection = new RTCPeerConnection(configuration);

    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate && this.channel) {
        this.channel.send({
          type: 'broadcast',
          event: 'ice-candidate',
          payload: { candidate: event.candidate, sender: this.isHost ? 'host' : 'client' }
        });
      }
    };

    this.peerConnection.onconnectionstatechange = () => {
      if (this.peerConnection?.connectionState === 'connected') {
        this.onStatusChange('connected');
      } else if (this.peerConnection?.connectionState === 'disconnected' || 
                 this.peerConnection?.connectionState === 'failed' || 
                 this.peerConnection?.connectionState === 'closed') {
        this.onStatusChange('disconnected');
      }
    };

    this.peerConnection.ondatachannel = (event) => {
      this.setupDataChannel(event.channel);
    };
  }

  private setupDataChannel(channel: RTCDataChannel) {
    this.dataChannel = channel;
    this.dataChannel.binaryType = 'arraybuffer';
    
    this.dataChannel.onopen = () => {
      this.onStatusChange('connected');
    };

    this.dataChannel.onclose = () => {
      this.onStatusChange('disconnected');
    };

    this.dataChannel.onmessage = (event) => {
      this.handleIncomingData(event.data);
    };
  }

  private async initiateCall() {
    this.createPeerConnection();
    
    if (this.peerConnection && this.channel) {
      const dataChannel = this.peerConnection.createDataChannel('fileTransfer');
      this.setupDataChannel(dataChannel);
      
      const offer = await this.peerConnection.createOffer();
      await this.peerConnection.setLocalDescription(offer);
      
      this.channel.send({
        type: 'broadcast',
        event: 'offer',
        payload: { sdp: offer }
      });
      this.onStatusChange('connecting');
    }
  }

  private async handleOffer(sdp: RTCSessionDescriptionInit) {
    this.createPeerConnection();
    
    if (this.peerConnection && this.channel) {
      await this.peerConnection.setRemoteDescription(new RTCSessionDescription(sdp));
      const answer = await this.peerConnection.createAnswer();
      await this.peerConnection.setLocalDescription(answer);
      
      this.channel.send({
        type: 'broadcast',
        event: 'answer',
        payload: { sdp: answer }
      });
      this.onStatusChange('connecting');
    }
  }

  private async handleAnswer(sdp: RTCSessionDescriptionInit) {
    if (this.peerConnection) {
      try {
        await this.peerConnection.setRemoteDescription(new RTCSessionDescription(sdp));
      } catch (e) {
        console.error('Error setting remote description from answer', e);
      }
    }
  }

  public joinRoom(roomId: string, isHost: boolean = false) {
    if (!supabase) {
      console.error('Cannot join room: Supabase is not initialized. Please add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your environment variables.');
      this.onStatusChange('disconnected');
      return;
    }

    this.roomId = roomId;
    this.isHost = isHost;
    
    // Create a new realtime channel for this room
    this.channel = supabase.channel(`room_${roomId}`);

    this.channel
      .on('broadcast', { event: 'join' }, async () => {
        if (this.isHost) {
          console.log('Client joined, initiating call...');
          await this.initiateCall();
        }
      })
      .on('broadcast', { event: 'offer' }, async ({ payload }) => {
        if (!this.isHost) {
          console.log('Received offer, sending answer...');
          await this.handleOffer(payload.sdp);
        }
      })
      .on('broadcast', { event: 'answer' }, async ({ payload }) => {
        if (this.isHost) {
          console.log('Received answer');
          await this.handleAnswer(payload.sdp);
        }
      })
      .on('broadcast', { event: 'ice-candidate' }, async ({ payload }) => {
        // Only process candidates from the other party
        if ((this.isHost && payload.sender === 'client') || (!this.isHost && payload.sender === 'host')) {
          if (this.peerConnection) {
            try {
              await this.peerConnection.addIceCandidate(new RTCIceCandidate(payload.candidate));
            } catch (e) {
              console.error('Error adding received ice candidate', e);
            }
          }
        }
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('Joined room channel:', roomId);
          this.onStatusChange('connecting');
          
          if (!this.isHost) {
            // Signal the host that we've joined
            this.channel?.send({
              type: 'broadcast',
              event: 'join',
              payload: {}
            });
          }
        }
      });
  }

  public disconnect() {
    if (this.channel) {
      this.channel.unsubscribe();
      this.channel = null;
    }
    if (this.dataChannel) {
      this.dataChannel.close();
      this.dataChannel = null;
    }
    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }
    this.onStatusChange('disconnected');
  }

  public sendFile(file: File) {
    if (!this.dataChannel || this.dataChannel.readyState !== 'open') {
      console.error('Data channel not open');
      return;
    }

    // Send metadata first
    const metadata: FileMetadata = {
      name: file.name,
      size: file.size,
      type: file.type
    };
    
    this.dataChannel.send(JSON.stringify({ type: 'file-metadata', metadata }));
    this.onFileTransferStart(metadata);

    // Read and send file in chunks
    const chunkSize = 64 * 1024; // 64KB
    let offset = 0;
    
    const fileReader = new FileReader();
    fileReader.onerror = error => console.error('Error reading file:', error);
    fileReader.onabort = () => console.log('File reading aborted');
    
    fileReader.onload = (e) => {
      if (!e.target?.result || !this.dataChannel) return;
      this.dataChannel.send(e.target.result as ArrayBuffer);
      offset += (e.target.result as ArrayBuffer).byteLength;
      
      this.onFileTransferProgress({ fileName: file.name, progress: offset / file.size });
      
      if (offset < file.size) {
        readSlice(offset);
      } else {
        // Send end signal
        this.dataChannel.send(JSON.stringify({ type: 'file-end' }));
        this.onFileTransferProgress({ fileName: file.name, progress: 1 });
      }
    };
    
    const readSlice = (o: number) => {
      const slice = file.slice(offset, o + chunkSize);
      fileReader.readAsArrayBuffer(slice);
    };
    
    // Slight delay to ensure metadata is processed
    setTimeout(() => {
      readSlice(0);
    }, 500);
  }

  private handleIncomingData(data: string | ArrayBuffer) {
    if (typeof data === 'string') {
      try {
        const parsed = JSON.parse(data);
        if (parsed.type === 'file-metadata') {
          this.incomingFileInfo = parsed.metadata;
          this.incomingFileData = [];
          this.receivedSize = 0;
          this.isReceivingFile = true;
          this.onFileTransferStart(parsed.metadata);
          this.onFileTransferProgress({ fileName: parsed.metadata.name, progress: 0 });
        } else if (parsed.type === 'file-end') {
          this.isReceivingFile = false;
          if (this.incomingFileInfo) {
            const blob = new Blob(this.incomingFileData, { type: this.incomingFileInfo.type });
            const url = URL.createObjectURL(blob);
            this.onFileTransferComplete(url, this.incomingFileInfo.name);
            this.onFileTransferProgress({ fileName: this.incomingFileInfo.name, progress: 1 });
          }
        } else {
          this.onReceiveMessage(data);
        }
      } catch (e) {
        // Just a string message
        this.onReceiveMessage(data);
      }
    } else {
      // It's an ArrayBuffer
      this.incomingFileData.push(data);
      this.receivedSize += data.byteLength;
      
      if (this.incomingFileInfo) {
        this.onFileTransferProgress({ 
          fileName: this.incomingFileInfo.name, 
          progress: this.receivedSize / this.incomingFileInfo.size 
        });
      }
    }
  }
}
