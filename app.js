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
    const streamerIdDisplay = document.getElementById('streamer-id-display');
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

    // Variaveis de Estado
    let peer = null;
    let localStream = null;
    let activeConnections = [];
    let localAgentSocket = null;
    let currentCall = null;
    let currentDataConnection = null;
    let reconnectTimeout = null;
    let lastMouseMoveTime = 0;
    const MOUSE_MOVE_THROTTLE_MS = 16; // ~60 vezes por segundo (60Hz) - mais responsivo

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

    // --- Lógica do Agente Python Local (WebSocket) ---
    function connectLocalAgent() {
        if (localAgentSocket && (localAgentSocket.readyState === WebSocket.OPEN || localAgentSocket.readyState === WebSocket.CONNECTING)) return;

        agentStatus.textContent = 'Conectando...';
        agentStatus.className = 'badge badge-gray';

        // Conecta no websocket local aberto pelo python agent.py
        localAgentSocket = new WebSocket('ws://localhost:9000');

        localAgentSocket.onopen = () => {
            agentStatus.textContent = 'Conectado';
            agentStatus.className = 'badge badge-green';
            console.log('[STREAMER] Conectado ao agente Python local na porta 9000');
        };

        localAgentSocket.onclose = () => {
            agentStatus.textContent = 'Desconectado';
            agentStatus.className = 'badge badge-red';
            localAgentSocket = null;
            // Tenta reconectar a cada 5 segundos se não estiver sendo limpo
            reconnectTimeout = setTimeout(connectLocalAgent, 5000);
        };

        localAgentSocket.onerror = (err) => {
            console.warn('[STREAMER] WebSocket do agente Python local falhou.');
        };
    }

    // --- Lógica do Streamer (Transmissor) ---
    function initStreamerMode() {
        connectLocalAgent();
        // Configura o PeerJS
        if (!peer) {
            const uniqueId = 'telestream-' + Math.random().toString(36).substring(2, 8);
            peer = new Peer(uniqueId);

            peer.on('open', (id) => {
                streamerIdDisplay.textContent = id;
                streamerIdDisplay.className = 'badge badge-green';
                console.log('[STREAMER] ID PeerJS gerado:', id);
            });

            peer.on('connection', (conn) => {
                console.log('[STREAMER] Conexão de dados recebida do Viewer');
                activeConnections.push(conn);
                
                conn.on('data', (data) => {
                    // PERFORMANCE: O viewer envia JSON string, repassar diretamente sem re-serializar
                    if (localAgentSocket && localAgentSocket.readyState === WebSocket.OPEN) {
                        // Se já é string, enviar direto. Se é objeto (fallback), serializar
                        const payload = typeof data === 'string' ? data : JSON.stringify(data);
                        localAgentSocket.send(payload);
                    } else {
                        console.warn('[STREAMER] Recebeu comando, mas o agente Python não está conectado.');
                    }
                });

                conn.on('close', () => {
                    console.log('[STREAMER] Conexão de dados do Viewer fechada');
                    activeConnections = activeConnections.filter(c => c !== conn);
                });
            });

            peer.on('call', (call) => {
                console.log('[STREAMER] Recebendo chamada de vídeo do Viewer. Respondendo...');
                if (localStream) {
                    call.answer(localStream);
                    currentCall = call;
                } else {
                    console.warn('[STREAMER] Nenhuma stream de vídeo local activa para responder a chamada.');
                }
            });

            peer.on('error', (err) => {
                console.error('[STREAMER] Erro PeerJS:', err);
                streamerIdDisplay.textContent = 'Erro de Rede';
                streamerIdDisplay.className = 'badge badge-red';
            });
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
        } catch (err) {
            console.error('[STREAMER] Falha ao capturar tela:', err);
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
    }

    function initViewerMode() {
        if (!peer) {
            // Cria um ID temporário e curto para o visualizador
            const viewerId = 'telestream-view-' + Math.random().toString(36).substring(2, 8);
            peer = new Peer(viewerId);

            peer.on('error', (err) => {
                console.error('[VIEWER] Erro PeerJS:', err);
                connectionStatus.textContent = 'Erro';
                connectionStatus.className = 'badge badge-red';
            });
        }
    }

    btnConnectStream.addEventListener('click', () => {
        const targetId = inputTargetId.value.trim();
        if (!targetId) {
            alert('Por favor, insira o ID do Transmissor.');
            return;
        }

        connectionStatus.textContent = 'Conectando...';
        connectionStatus.className = 'badge badge-gray';

        console.log('[VIEWER] Conectando ao ID:', targetId);

        // 1. Abre a conexão de dados (DataChannel)
        // PERFORMANCE: reliable:false = modo UDP (sem re-transmissão de pacotes perdidos)
        // Para inputs de mouse, um pacote perdido é melhor ignorar do que esperar - reduz latência massivamente
        currentDataConnection = peer.connect(targetId, {
            reliable: false,
            serialization: 'none'
        });

        currentDataConnection.on('open', () => {
            console.log('[VIEWER] Conexão de dados aberta!');
            connectionStatus.textContent = 'Conectado';
            connectionStatus.className = 'badge badge-green';
            
            btnConnectStream.classList.add('hidden');
            btnDisconnectStream.classList.remove('hidden');
            viewerControlBar.classList.remove('hidden');
            inputTargetId.disabled = true;
        });

        currentDataConnection.on('close', () => {
            console.log('[VIEWER] Conexão de dados encerrada.');
            disconnectViewer();
        });

        currentDataConnection.on('error', (err) => {
            console.error('[VIEWER] Erro na conexão de dados:', err);
            disconnectViewer();
        });

        // 2. Inicia chamada de mídia (requisita vídeo do streamer)
        // Criamos uma stream silenciosa fake só para convencer o PeerJS a responder com a stream do streamer
        navigator.mediaDevices.getUserMedia = navigator.mediaDevices.getUserMedia || navigator.mediaDevices.webkitGetUserMedia || navigator.mediaDevices.mozGetUserMedia;
        
        const canvas = document.createElement('canvas');
        canvas.width = 10;
        canvas.height = 10;
        const dummyStream = canvas.captureStream(1);
        
        const call = peer.call(targetId, dummyStream);
        
        call.on('stream', (remoteStream) => {
            console.log('[VIEWER] Recebeu stream de vídeo do transmissor.');
            remoteVideo.srcObject = remoteStream;
            remoteVideo.classList.remove('hidden');
            videoPlaceholder.classList.add('hidden');
        });

        call.on('close', () => {
            console.log('[VIEWER] Chamada de vídeo finalizada.');
            disconnectViewer();
        });

        call.on('error', (err) => {
            console.error('[VIEWER] Erro na chamada de vídeo:', err);
            disconnectViewer();
        });

        currentCall = call;
    });

    btnDisconnectStream.addEventListener('click', () => {
        disconnectViewer();
    });

    function disconnectViewer() {
        if (currentCall) {
            currentCall.close();
            currentCall = null;
        }
        if (currentDataConnection) {
            currentDataConnection.close();
            currentDataConnection = null;
        }

        remoteVideo.srcObject = null;
        remoteVideo.classList.add('hidden');
        videoPlaceholder.classList.remove('hidden');
        
        btnConnectStream.classList.remove('hidden');
        btnDisconnectStream.classList.add('hidden');
        viewerControlBar.classList.add('hidden');
        inputTargetId.disabled = false;

        connectionStatus.textContent = 'Desconectado';
        connectionStatus.className = 'badge badge-gray';
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
            localAgentSocket.onclose = null; // Evita loop de reconexão
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
        if (currentDataConnection && currentDataConnection.open) {
            // PERFORMANCE: Serializar para string antes de enviar evita overhead do PeerJS serializando objeto
            currentDataConnection.send(JSON.stringify(eventObj));
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
