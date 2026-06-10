document.addEventListener('DOMContentLoaded', () => {
    // Elementos de Navegação
    const modeSelector = document.getElementById('mode-selector');
    const panelStreamer = document.getElementById('panel-streamer');
    const panelViewer = document.getElementById('panel-viewer');
    
    const btnSelectStreamer = document.getElementById('btn-select-streamer');
    const btnSelectViewer = document.getElementById('btn-select-viewer');
    const btnBackList = document.querySelectorAll('.btn-back');

    // Elementos do Streamer
    const btnStartStream = document.getElementById('btn-start-stream');
    const btnStopStream = document.getElementById('btn-stop-stream');
    const agentStatus = document.getElementById('agent-status');
    const agentPulse = document.getElementById('agent-pulse');
    const streamerIdDisplay = document.getElementById('streamer-id-display');
    const btnCopyId = document.getElementById('btn-copy-id');
    const localVideoPreview = document.getElementById('local-video-preview');

    // Elementos do Viewer
    const inputTargetId = document.getElementById('input-target-id');
    const btnConnectStream = document.getElementById('btn-connect-stream');
    const btnDisconnectStream = document.getElementById('btn-disconnect-stream');
    const viewerControlBar = document.getElementById('viewer-control-bar');
    const connectionStatus = document.getElementById('connection-status');
    const toggleControlEnabled = document.getElementById('toggle-control-enabled');
    const videoContainer = document.getElementById('video-container');
    const videoPlaceholder = document.getElementById('video-placeholder');
    const remoteVideo = document.getElementById('remote-video');
    const btnToggleScale = document.getElementById('btn-toggle-scale');
    const btnFullscreen = document.getElementById('btn-fullscreen');

    // Variaveis de Estado
    let peer = null;
    let localStream = null;
    let activeConnections = [];
    let localAgentSocket = null;
    let currentCall = null;
    let currentDataConnection = null;  // Canal de dados do Viewer (RTCDataChannel nativo)
    let rtcPeerConnection = null;       // Conexão WebRTC nativa do Viewer (RTCPeerConnection)
    let signalingWebsocket = null;      // WebSocket temporário de sinalização do Viewer
    let reconnectTimeout = null;
    let lastMouseMoveTime = 0;
    const MOUSE_MOVE_THROTTLE_MS = 16; // ~60 vezes por segundo (60Hz) - mais responsivo

    // Variáveis para estatísticas do WebRTC
    let statsInterval = null;
    let lastFramesDecoded = 0;
    let lastBytesReceived = 0;
    let lastStatsTimestamp = 0;
    let isOriginalScale = true;

    // Navegação do Hub
    btnSelectStreamer.addEventListener('click', () => {
        modeSelector.classList.add('hidden');
        panelStreamer.classList.remove('hidden');
        initStreamerMode();
    });

    btnSelectViewer.addEventListener('click', () => {
        modeSelector.classList.add('hidden');
        panelViewer.classList.remove('hidden');
        initViewerMode();
    });

    btnBackList.forEach(btn => {
        btn.addEventListener('click', () => {
            cleanupAll();
            panelStreamer.classList.add('hidden');
            panelViewer.classList.add('hidden');
            modeSelector.classList.remove('hidden');
        });
    });

    // --- Helpers de Logs para os Consoles ---
    function escapeHtml(text) {
        const map = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        };
        return text.toString().replace(/[&<>"']/g, function(m) { return map[m]; });
    }

    function logStreamerEvent(message, type = 'info') {
        const consoleBody = document.getElementById('streamer-console');
        if (!consoleBody) return;
        
        const placeholder = consoleBody.querySelector('.console-placeholder');
        if (placeholder) placeholder.remove();
        
        const timeStr = new Date().toLocaleTimeString();
        const line = document.createElement('div');
        line.className = `console-line ${type}`;
        line.innerHTML = `<span class="timestamp">[${timeStr}]</span>${escapeHtml(message)}`;
        
        consoleBody.appendChild(line);
        consoleBody.scrollTop = consoleBody.scrollHeight;
        
        // Limite de linhas
        while (consoleBody.childElementCount > 30) {
            consoleBody.removeChild(consoleBody.firstChild);
        }
        
        // Efeito de pulso rápido no console
        const pulse = document.getElementById('streamer-console-pulse');
        if (pulse) {
            pulse.style.animation = 'none';
            void pulse.offsetWidth; // trigger reflow
            pulse.style.animation = 'consolePulseAnim 0.5s ease-out';
        }
    }

    function logViewerEvent(message, type = 'info') {
        const consoleBody = document.getElementById('viewer-console');
        if (!consoleBody) return;
        
        const placeholder = consoleBody.querySelector('.console-placeholder');
        if (placeholder) placeholder.remove();
        
        const timeStr = new Date().toLocaleTimeString();
        const line = document.createElement('div');
        line.className = `console-line ${type}`;
        line.innerHTML = `<span class="timestamp">[${timeStr}]</span>${escapeHtml(message)}`;
        
        consoleBody.appendChild(line);
        consoleBody.scrollTop = consoleBody.scrollHeight;
        
        // Limite de linhas
        while (consoleBody.childElementCount > 30) {
            consoleBody.removeChild(consoleBody.firstChild);
        }

        // Efeito de pulso rápido no console
        const pulse = document.getElementById('viewer-console-pulse');
        if (pulse) {
            pulse.style.animation = 'none';
            void pulse.offsetWidth; // trigger reflow
            pulse.style.animation = 'consolePulseAnim 0.5s ease-out';
        }
    }

    // Copiar ID do Streamer
    btnCopyId.addEventListener('click', () => {
        const id = streamerIdDisplay.textContent;
        if (id && id !== 'Aguardando...' && id !== 'Reconectando...') {
            navigator.clipboard.writeText(id).then(() => {
                const originalText = btnCopyId.textContent;
                btnCopyId.textContent = '✅';
                logStreamerEvent('ID de conexão copiado para a área de transferência.', 'info');
                setTimeout(() => { btnCopyId.textContent = originalText; }, 1500);
            });
        }
    });

    // --- Lógica do Agente Python Local (WebSocket) ---
    function connectLocalAgent() {
        if (localAgentSocket && (localAgentSocket.readyState === WebSocket.OPEN || localAgentSocket.readyState === WebSocket.CONNECTING)) return;

        agentStatus.textContent = 'Conectando...';
        agentStatus.className = 'badge badge-gray';
        agentPulse.className = 'pulse-dot red';

        // Conecta no websocket local aberto pelo python agent.py
        localAgentSocket = new WebSocket('ws://localhost:9000');

        localAgentSocket.onopen = () => {
            agentStatus.textContent = 'Conectado';
            agentStatus.className = 'badge badge-green';
            agentPulse.className = 'pulse-dot green';
            console.log('[STREAMER] Conectado ao agente Python local na porta 9000');
            logStreamerEvent('Agente Python local conectado na porta 9000.', 'info');
        };

        localAgentSocket.onclose = () => {
            agentStatus.textContent = 'Desconectado';
            agentStatus.className = 'badge badge-red';
            agentPulse.className = 'pulse-dot red';
            localAgentSocket = null;
            logStreamerEvent('Agente Python local desconectado.', 'warn');
            // Tenta reconectar a cada 5 segundos se não estiver sendo limpo
            reconnectTimeout = setTimeout(connectLocalAgent, 5000);
        };

        localAgentSocket.onerror = (err) => {
            console.warn('[STREAMER] WebSocket do agente Python local falhou.');
        };
    }

    // --- Lógica do Streamer (Transmissor) ---

    // Registra todos os event handlers de um objeto peer do streamer.
    // Separado de initStreamerMode para permitir re-registro após reconexão.
    function attachStreamerHandlers(peerObj) {
        peerObj.on('open', (id) => {
            streamerIdDisplay.textContent = id;
            streamerIdDisplay.className = 'badge badge-green';
            btnCopyId.classList.remove('hidden');
            console.log('[STREAMER] ID PeerJS gerado:', id);
            logStreamerEvent(`Sinalização ativa. ID gerado: ${id}`, 'info');
        });

        peerObj.on('connection', (conn) => {
            console.log('[STREAMER] Conexão de dados recebida do Viewer');
            logStreamerEvent('Viewer conectado via DataChannel (P2P).', 'info');
            activeConnections.push(conn);

            conn.on('data', (data) => {
                // PERFORMANCE: O viewer envia JSON string, repassar diretamente sem re-serializar
                if (localAgentSocket && localAgentSocket.readyState === WebSocket.OPEN) {
                    const payload = typeof data === 'string' ? data : JSON.stringify(data);
                    localAgentSocket.send(payload);

                    // Adicionar ao painel de logs do Streamer
                    try {
                        const parsed = typeof data === 'string' ? JSON.parse(data) : data;
                        let desc = '';
                        if (parsed.type === 'mousemove') {
                            desc = `Mouse posic. em: (${parsed.x.toFixed(3)}, ${parsed.y.toFixed(3)})`;
                        } else if (parsed.type === 'mousedown') {
                            desc = `Clique pressionado: ${parsed.button}`;
                        } else if (parsed.type === 'mouseup') {
                            desc = `Clique liberado: ${parsed.button}`;
                        } else if (parsed.type === 'scroll') {
                            desc = `Rolagem de tela (deltaY: ${parsed.deltaY})`;
                        } else if (parsed.type === 'keydown') {
                            desc = `Tecla pressionada: ${parsed.key}`;
                        } else if (parsed.type === 'keyup') {
                            desc = `Tecla liberada: ${parsed.key}`;
                        } else {
                            desc = parsed.type;
                        }
                        logStreamerEvent(`Ação: ${desc}`, 'action');
                    } catch (e) {}
                } else {
                    console.warn('[STREAMER] Recebeu comando, mas o agente Python não está conectado.');
                    logStreamerEvent('Ação recebida, mas o agente Python está desconectado!', 'warn');
                }
            });

            conn.on('close', () => {
                console.log('[STREAMER] Conexão de dados do Viewer fechada');
                logStreamerEvent('Viewer encerrou a conexão de dados.', 'warn');
                activeConnections = activeConnections.filter(c => c !== conn);
            });
        });

        peerObj.on('call', (call) => {
            console.log('[STREAMER] Recebendo chamada de vídeo do Viewer. Respondendo...');
            logStreamerEvent('Chamada de vídeo recebida. Transmitindo stream...', 'info');
            if (localStream) {
                call.answer(localStream);
                currentCall = call;
            } else {
                console.warn('[STREAMER] Nenhuma stream de vídeo local ativa para responder a chamada.');
                logStreamerEvent('Falha: nenhuma tela sendo capturada para enviar!', 'warn');
            }
        });

        peerObj.on('error', (err) => {
            console.error('[STREAMER] Erro PeerJS:', err);
            logStreamerEvent(`Erro de Sinalização: ${err.message || err.type}`, 'warn');
            // Tipos de erro que indicam queda do servidor de sinalização
            const serverErrors = ['server-error', 'network', 'socket-error', 'socket-closed'];
            if (serverErrors.includes(err.type)) {
                console.warn('[STREAMER] Servidor de sinalização PeerJS caiu. Reconectando em 3s...');
                streamerIdDisplay.textContent = 'Reconectando...';
                streamerIdDisplay.className = 'badge badge-gray';
                btnCopyId.classList.add('hidden');
                
                const oldId = peerObj.id || ('telestream-' + Math.random().toString(36).substring(2, 8));
                peer.destroy();
                peer = null;
                setTimeout(() => {
                    peer = new Peer(oldId);
                    attachStreamerHandlers(peer);
                }, 3000);
            } else {
                streamerIdDisplay.textContent = 'Erro de Rede';
                streamerIdDisplay.className = 'badge badge-red';
            }
        });
    }

    function initStreamerMode() {
        connectLocalAgent();
        // Configura o PeerJS
        if (!peer) {
            const uniqueId = 'telestream-' + Math.random().toString(36).substring(2, 8);
            peer = new Peer(uniqueId);
            attachStreamerHandlers(peer);
        }
    }

    btnStartStream.addEventListener('click', async () => {
        try {
            // Requisitar tela ao navegador
            // PERFORMANCE: Limitar resolução a 1080p e priorizar framerate alto
            // Resoluções maiores (4K, 1440p) causam lag na codificação e transmissão
            localStream = await navigator.mediaDevices.getDisplayMedia({
                video: {
                    cursor: "always",
                    width: { ideal: 1920, max: 1920 },
                    height: { ideal: 1080, max: 1080 },
                    frameRate: { ideal: 60, max: 60 }
                },
                audio: false
            });

            localVideoPreview.srcObject = localStream;
            localVideoPreview.classList.remove('hidden');
            
            btnStartStream.classList.add('hidden');
            btnStopStream.classList.remove('hidden');

            // Se a stream for interrompida pelo botão flutuante nativo do navegador
            const videoTrack = localStream.getVideoTracks()[0];
            if (videoTrack) {
                videoTrack.onended = () => {
                    stopStream();
                };
            }

            console.log('[STREAMER] Captura de tela iniciada com sucesso.');
            logStreamerEvent('Captura de tela local iniciada a 60 FPS / 1080p.', 'info');
        } catch (err) {
            console.error('[STREAMER] Falha ao capturar tela:', err);
            logStreamerEvent(`Falha na captura: ${err.message}`, 'warn');
            alert('Não foi possível iniciar a captura de tela. Certifique-se de dar as permissões necessárias.');
        }
    });

    btnStopStream.addEventListener('click', () => {
        stopStream();
    });

    function stopStream() {
        if (localStream) {
            localStream.getTracks().forEach(track => track.stop());
            localStream = null;
        }
        if (currentCall) {
            currentCall.close();
            currentCall = null;
        }
        localVideoPreview.srcObject = null;
        localVideoPreview.classList.add('hidden');
        
        btnStartStream.classList.remove('hidden');
        btnStopStream.classList.add('hidden');
        console.log('[STREAMER] Transmissão parada.');
        logStreamerEvent('Transmissão de vídeo finalizada.', 'info');
    }

    // --- Lógica do Visualizador (Viewer) ---
    function initViewerMode() {
        // Modo viewer agora usa RTCPeerConnection direta. Apenas logar.
        console.log('[VIEWER] Modo Visualizador ativo. Pronto para conexões P2P.');
    }

    // Monitoramento de FPS e Latência em Tempo Real via WebRTC Stats
    function startStatsMonitoring(pc) {
        if (statsInterval) clearInterval(statsInterval);
        
        lastFramesDecoded = 0;
        lastBytesReceived = 0;
        lastStatsTimestamp = performance.now();
        
        statsInterval = setInterval(async () => {
            if (!pc || pc.connectionState === 'closed' || pc.connectionState === 'failed') {
                clearInterval(statsInterval);
                return;
            }
            
            try {
                const stats = await pc.getStats();
                const now = performance.now();
                const deltaSeconds = (now - lastStatsTimestamp) / 1000;
                
                stats.forEach(report => {
                    // FPS e Bytes recebidos (Vídeo)
                    if (report.type === 'inbound-rtp' && report.kind === 'video') {
                        const framesDecoded = report.framesDecoded || 0;
                        const bytesReceived = report.bytesReceived || 0;
                        
                        if (deltaSeconds > 0) {
                            // FPS
                            const fps = Math.round((framesDecoded - lastFramesDecoded) / deltaSeconds);
                            document.getElementById('val-fps').textContent = Math.max(0, fps);
                            
                            // Banda (Kbps)
                            const bytesDelta = bytesReceived - lastBytesReceived;
                            const kbps = Math.round(((bytesDelta * 8) / 1000) / deltaSeconds);
                            document.getElementById('val-bandwidth').textContent = `${Math.max(0, kbps)} Kbps`;
                        }
                        
                        lastFramesDecoded = framesDecoded;
                        lastBytesReceived = bytesReceived;
                    }
                    
                    // RTT (Latência da Rede)
                    if (report.type === 'candidate-pair' && report.state === 'succeeded') {
                        const rtt = report.currentRoundTripTime;
                        if (rtt !== undefined) {
                            const latencyMs = Math.round(rtt * 1000);
                            document.getElementById('val-latency').textContent = `${latencyMs} ms`;
                            
                            // Atualizar a cor da bolinha de status baseado no RTT
                            const pulseDot = document.getElementById('viewer-pulse-dot');
                            if (pulseDot) {
                                if (latencyMs < 50) {
                                    pulseDot.className = 'pulse-dot green';
                                    pulseDot.style.backgroundColor = '';
                                } else if (latencyMs < 150) {
                                    pulseDot.className = 'pulse-dot yellow';
                                    pulseDot.style.backgroundColor = 'var(--accent-yellow)';
                                } else {
                                    pulseDot.className = 'pulse-dot red';
                                    pulseDot.style.backgroundColor = 'var(--accent-red)';
                                }
                            }
                        }
                    }
                });
                
                lastStatsTimestamp = now;
            } catch (err) {
                console.warn('[VIEWER] Erro ao buscar estatísticas:', err);
            }
        }, 1000);
    }

    function stopStatsMonitoring() {
        if (statsInterval) {
            clearInterval(statsInterval);
            statsInterval = null;
        }
        document.getElementById('val-fps').textContent = '0';
        document.getElementById('val-latency').textContent = '0 ms';
        document.getElementById('val-bandwidth').textContent = '0 Kbps';
        document.getElementById('viewer-pulse-dot').className = 'pulse-dot green';
        document.getElementById('viewer-pulse-dot').style.backgroundColor = '';
    }

    // Toggle de escala
    btnToggleScale.addEventListener('click', () => {
        isOriginalScale = !isOriginalScale;
        if (isOriginalScale) {
            videoContainer.classList.remove('fill-scale');
            btnToggleScale.textContent = '📏 Original';
        } else {
            videoContainer.classList.add('fill-scale');
            btnToggleScale.textContent = '📏 Esticar';
        }
        logViewerEvent(`Escala de vídeo alterada para: ${isOriginalScale ? 'Original' : 'Esticar'}`, 'info');
    });

    // Tela cheia
    btnFullscreen.addEventListener('click', () => {
        if (!document.fullscreenElement) {
            videoContainer.requestFullscreen().catch(err => {
                console.error(`Erro ao ativar Tela Cheia: ${err.message}`);
            });
        } else {
            document.exitFullscreen();
        }
    });
    
    document.addEventListener('fullscreenchange', () => {
        if (document.fullscreenElement) {
            btnFullscreen.textContent = '📺 Janela';
            logViewerEvent('Tela Cheia ativada.', 'info');
        } else {
            btnFullscreen.textContent = '📺 Tela Cheia';
            logViewerEvent('Tela Cheia desativada.', 'info');
        }
    });

    // Toggle de exibição do console ao habilitar controle remoto
    toggleControlEnabled.addEventListener('change', () => {
        const consoleWrapper = document.getElementById('viewer-console-wrapper');
        const viewerGrid = document.querySelector('.viewer-grid');
        if (toggleControlEnabled.checked) {
            consoleWrapper.classList.remove('hidden');
            viewerGrid.classList.add('with-console');
            logViewerEvent('Controle remoto habilitado. Teclado e mouse ativos.', 'info');
        } else {
            consoleWrapper.classList.add('hidden');
            viewerGrid.classList.remove('with-console');
        }
    });

    // Conectar ao Agente Nativo WebRTC
    btnConnectStream.addEventListener('click', () => {
        const targetId = inputTargetId.value.trim();
        if (!targetId) {
            alert('Por favor, insira a chave do Transmissor.');
            return;
        }

        connectionStatus.textContent = 'Conectando...';
        document.getElementById('viewer-pulse-dot').className = 'pulse-dot red';
        logViewerEvent(`Estabelecendo conexão WebRTC direta com: ${targetId}...`, 'info');

        try {
            // 1. Criar a RTCPeerConnection
            rtcPeerConnection = new RTCPeerConnection({
                iceServers: [
                    { urls: 'stun:stun.l.google.com:19302' },
                    { urls: 'stun:stun1.l.google.com:19302' }
                ]
            });

            // 2. Criar canal de dados para os comandos
            currentDataConnection = rtcPeerConnection.createDataChannel('control', {
                ordered: true
            });

            currentDataConnection.onopen = () => {
                console.log('[VIEWER] Canal de controle aberto!');
                connectionStatus.textContent = 'Conectado';
                document.getElementById('viewer-pulse-dot').className = 'pulse-dot green';
                
                btnConnectStream.classList.add('hidden');
                btnDisconnectStream.classList.remove('hidden');
                viewerControlBar.classList.remove('hidden');
                inputTargetId.disabled = true;

                logViewerEvent(`Canal de dados aberto. Controle remoto ativo.`, 'info');
                if (toggleControlEnabled.checked) {
                    document.getElementById('viewer-console-wrapper').classList.remove('hidden');
                    document.querySelector('.viewer-grid').classList.add('with-console');
                }
            };

            currentDataConnection.onclose = () => {
                console.log('[VIEWER] Canal de controle fechado.');
                logViewerEvent('Conexão de controle encerrada.', 'warn');
                disconnectViewer();
            };

            currentDataConnection.onerror = (err) => {
                console.error('[VIEWER] Erro no canal de dados:', err);
                logViewerEvent(`Erro no canal de dados: ${err.message}`, 'warn');
                disconnectViewer();
            };

            // 3. Capturar track de vídeo recebida do Python
            rtcPeerConnection.ontrack = (event) => {
                console.log('[VIEWER] Track de vídeo remota recebida.');
                logViewerEvent('Stream de vídeo nativo recebido via WebRTC.', 'info');
                
                remoteVideo.srcObject = event.streams[0] || (event.track ? new MediaStream([event.track]) : null);
                remoteVideo.classList.remove('hidden');
                videoPlaceholder.classList.add('hidden');
                
                // Iniciar estatísticas reais do WebRTC
                startStatsMonitoring(rtcPeerConnection);
            };

            // 4. Solicitar recebimento de vídeo
            rtcPeerConnection.addTransceiver('video', { direction: 'recvonly' });

            // 5. Canal de sinalização temporário via WebSocket público do PeerJS
            const viewerId = 'telestream-view-' + Math.random().toString(36).substring(2, 8);
            const token = Math.random().toString(36).substring(2, 8);
            const wsUrl = `wss://0.peerjs.com/peerjs?key=peerjs&id=${viewerId}&token=${token}&version=1.5.2`;
            
            signalingWebsocket = new WebSocket(wsUrl);

            signalingWebsocket.onopen = async () => {
                console.log('[VIEWER] Canal de sinalização WebSocket conectado.');
                
                // Criar oferta SDP
                const offer = await rtcPeerConnection.createOffer();
                await rtcPeerConnection.setLocalDescription(offer);

                // Esperar a coleta de candidatos ICE se completar
                rtcPeerConnection.onicegatheringstatechange = () => {
                    if (rtcPeerConnection.iceGatheringState === 'complete') {
                        console.log('[VIEWER] ICE Gathering completo. Enviando oferta SDP...');
                        signalingWebsocket.send(JSON.stringify({
                            type: 'OFFER',
                            src: viewerId,
                            dst: targetId,
                            payload: {
                                type: 'offer',
                                sdp: rtcPeerConnection.localDescription.sdp
                            }
                        }));
                    }
                };
                
                if (rtcPeerConnection.iceGatheringState === 'complete') {
                    signalingWebsocket.send(JSON.stringify({
                        type: 'OFFER',
                        src: viewerId,
                        dst: targetId,
                        payload: {
                            type: 'offer',
                            sdp: rtcPeerConnection.localDescription.sdp
                        }
                    }));
                }
            };

            signalingWebsocket.onmessage = async (event) => {
                try {
                    const data = JSON.parse(event.data);
                    if (data.type === 'ANSWER') {
                        console.log('[VIEWER] Resposta SDP remota recebida.');
                        await rtcPeerConnection.setRemoteDescription(new RTCSessionDescription({
                            type: 'answer',
                            sdp: data.payload.sdp
                        }));
                        logViewerEvent('Conexão P2P negociada com sucesso!', 'info');
                        
                        // Fechar canal de sinalização - o P2P já está estabelecido!
                        signalingWebsocket.close();
                        signalingWebsocket = null;
                    }
                } catch (err) {
                    console.error('[VIEWER] Erro na sinalização:', err);
                }
            };

            signalingWebsocket.onerror = (err) => {
                console.error('[VIEWER] Erro de sinalização:', err);
                logViewerEvent('Falha na sinalização WebSocket pública.', 'warn');
                disconnectViewer();
            };

        } catch (err) {
            console.error('[VIEWER] Falha ao conectar:', err);
            logViewerEvent(`Falha na conexão: ${err.message}`, 'warn');
            alert('Erro ao iniciar a conexão.');
            disconnectViewer();
        }
    });

    btnDisconnectStream.addEventListener('click', () => {
        logViewerEvent('Desconectando sessão ativa...', 'info');
        disconnectViewer();
    });

    function disconnectViewer() {
        stopStatsMonitoring();
        if (currentCall) {
            currentCall.close();
            currentCall = null;
        }
        
        if (currentDataConnection) {
            currentDataConnection.close();
            currentDataConnection = null;
        }
        
        if (rtcPeerConnection) {
            rtcPeerConnection.close();
            rtcPeerConnection = null;
        }
        
        if (signalingWebsocket) {
            signalingWebsocket.close();
            signalingWebsocket = null;
        }

        remoteVideo.srcObject = null;
        remoteVideo.classList.add('hidden');
        videoPlaceholder.classList.remove('hidden');
        
        btnConnectStream.classList.remove('hidden');
        btnDisconnectStream.classList.add('hidden');
        viewerControlBar.classList.add('hidden');
        inputTargetId.disabled = false;

        document.getElementById('viewer-console-wrapper').classList.add('hidden');
        document.querySelector('.viewer-grid').classList.remove('with-console');

        connectionStatus.textContent = 'Desconectado';
        console.log('[VIEWER] Conexão desconectada e limpa.');
    }

    function cleanupAll() {
        stopStream();
        disconnectViewer();
        
        if (reconnectTimeout) {
            clearTimeout(reconnectTimeout);
            reconnectTimeout = null;
        }
        if (localAgentSocket) {
            localAgentSocket.onclose = null;
            localAgentSocket.close();
            localAgentSocket = null;
        }
        activeConnections.forEach(conn => conn.close());
        activeConnections = [];
        
        if (peer) {
            peer.destroy();
            peer = null;
        }
    }

    // --- Captura de Eventos de Input no Vídeo ---
    function sendControlEvent(eventObj) {
        if (!toggleControlEnabled.checked) return;
        
        // No RTCDataChannel nativo usamos readyState === 'open'
        if (currentDataConnection && currentDataConnection.readyState === 'open') {
            currentDataConnection.send(JSON.stringify(eventObj));
            
            // Adicionar ao painel de logs do Viewer
            let desc = '';
            if (eventObj.type === 'mousemove') {
                desc = `MouseMove (${eventObj.x.toFixed(3)}, ${eventObj.y.toFixed(3)})`;
            } else if (eventObj.type === 'mousedown') {
                desc = `MouseDown: ${eventObj.button}`;
            } else if (eventObj.type === 'mouseup') {
                desc = `MouseUp: ${eventObj.button}`;
            } else if (eventObj.type === 'scroll') {
                desc = `Scroll: ${eventObj.deltaY}`;
            } else if (eventObj.type === 'keydown') {
                desc = `KeyDown: ${eventObj.key}`;
            } else if (eventObj.type === 'keyup') {
                desc = `KeyUp: ${eventObj.key}`;
            } else {
                desc = eventObj.type;
            }
            logViewerEvent(`Enviado: ${desc}`, 'action');
        }
    }

    // 1. Mouse Move e Cliques
    remoteVideo.addEventListener('mousemove', (e) => {
        const now = Date.now();
        if (now - lastMouseMoveTime < MOUSE_MOVE_THROTTLE_MS) return;
        lastMouseMoveTime = now;

        const rect = remoteVideo.getBoundingClientRect();
        const rx = (e.clientX - rect.left) / rect.width;
        const ry = (e.clientY - rect.top) / rect.height;

        const x = Math.max(0, Math.min(1, rx));
        const y = Math.max(0, Math.min(1, ry));

        sendControlEvent({
            type: 'mousemove',
            x: x,
            y: y
        });
    });

    const mouseButtons = { 0: 'left', 1: 'middle', 2: 'right' };

    remoteVideo.addEventListener('mousedown', (e) => {
        const button = mouseButtons[e.button];
        if (button) {
            sendControlEvent({
                type: 'mousedown',
                button: button
            });
        }
    });

    remoteVideo.addEventListener('mouseup', (e) => {
        const button = mouseButtons[e.button];
        if (button) {
            sendControlEvent({
                type: 'mouseup',
                button: button
            });
        }
    });

    remoteVideo.addEventListener('contextmenu', (e) => {
        if (toggleControlEnabled.checked) {
            e.preventDefault();
        }
    });

    // 2. Rolagem de tela (Scroll)
    remoteVideo.addEventListener('wheel', (e) => {
        if (toggleControlEnabled.checked) {
            e.preventDefault();
            sendControlEvent({
                type: 'scroll',
                deltaY: e.deltaY
            });
        }
    }, { passive: false });

    // 3. Captura do Teclado
    let mouseOverVideo = false;
    remoteVideo.addEventListener('mouseenter', () => { mouseOverVideo = true; });
    remoteVideo.addEventListener('mouseleave', () => { mouseOverVideo = false; });

    const keyMap = {
        'ArrowUp': 'up',
        'ArrowDown': 'down',
        'ArrowLeft': 'left',
        'ArrowRight': 'right',
        'Enter': 'enter',
        'Backspace': 'backspace',
        'Tab': 'tab',
        'Escape': 'escape',
        'Shift': 'shift',
        'Control': 'ctrl',
        'Alt': 'alt',
        ' ': 'space'
    };

    window.addEventListener('keydown', (e) => {
        if (!toggleControlEnabled.checked || !mouseOverVideo) return;
        
        if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.key) || e.key === ' ') {
            e.preventDefault();
        }

        const key = keyMap[e.key] || e.key.toLowerCase();
        sendControlEvent({
            type: 'keydown',
            key: key
        });
    });

    window.addEventListener('keyup', (e) => {
        if (!toggleControlEnabled.checked || !mouseOverVideo) return;

        const key = keyMap[e.key] || e.key.toLowerCase();
        sendControlEvent({
            type: 'keyup',
            key: key
        });
    });
});
