# Plano de Implementação - TeleStream Remote

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar um sistema WebRTC de transmissão e controle remoto de tela com interface premium rodando no GitHub Pages e um agente local em Python para simulação de comandos.

**Architecture:** O visualizador (Viewer) envia comandos de input via canal de dados WebRTC para o transmissor (Streamer). O navegador do transmissor repassa esses comandos via WebSocket local para um agente Python que roda `pyautogui` na máquina local para executar os cliques/teclas.

**Tech Stack:** HTML5, CSS3, JavaScript, PeerJS (WebRTC), Python 3 (websockets, pyautogui).

---

### Task 1: Agente Python Local (`agent.py`)

**Files:**
- Create: `agent.py`
- Test: `test_agent.py`

- [ ] **Step 1: Escrever teste de unidade para processamento de mensagens no agente**
  Escrever um teste em `test_agent.py` que valide a função de tratamento de eventos JSON recebidos via WebSocket, garantindo que ela decodifique corretamente e retorne as ações correspondentes sem chamar o pyautogui diretamente durante o teste.

  ```python
  import json
  import pytest

  # Função simuladora para teste de validação de comandos
  def validate_and_parse_command(message_str):
      try:
          msg = json.loads(message_str)
      except ValueError:
          return None, "Erro de JSON inválido"
      
      msg_type = msg.get("type")
      if not msg_type:
          return None, "Tipo ausente"
      
      if msg_type == "mousemove":
          x = msg.get("x")
          y = msg.get("y")
          if x is None or y is None:
              return None, "Coordenadas ausentes"
          return ("mousemove", float(x), float(y)), None
      elif msg_type in ["mousedown", "mouseup", "click"]:
          btn = msg.get("button", "left")
          if btn not in ["left", "right", "middle"]:
              return None, "Botão inválido"
          return (msg_type, btn), None
      elif msg_type == "scroll":
          delta = msg.get("deltaY", 0)
          return ("scroll", int(delta)), None
      elif msg_type in ["keydown", "keyup"]:
          key = msg.get("key")
          if not key:
              return None, "Tecla ausente"
          return (msg_type, str(key)), None
      
      return None, "Tipo desconhecido"

  def test_validate_and_parse_command():
      # Teste movimento de mouse válido
      cmd, err = validate_and_parse_command('{"type": "mousemove", "x": 0.5, "y": 0.5}')
      assert cmd == ("mousemove", 0.5, 0.5)
      assert err is None

      # Teste clique válido
      cmd, err = validate_and_parse_command('{"type": "click", "button": "right"}')
      assert cmd == ("click", "right")
      assert err is None

      # Teste comando inválido
      cmd, err = validate_and_parse_command('{"type": "invalid"}')
      assert cmd is None
      assert err == "Tipo desconhecido"
  ```

- [ ] **Step 2: Rodar o teste para verificar se falha**
  Como a lógica e a função não existem no código de produção ainda, precisamos rodar os testes.
  Comando: `pytest test_agent.py`
  Esperado: FAIL/Error (pois `pytest` pode não estar instalado ou o arquivo `agent.py` não tem essa função ainda).

- [ ] **Step 3: Implementar o código mínimo no `agent.py`**
  Criar o arquivo `agent.py` contendo o servidor WebSocket e o parser de comandos integrado com `pyautogui` para execução.

  ```python
  import asyncio
  import websockets
  import json
  import pyautogui

  # Failsafe de segurança: mover o mouse para qualquer canto cancela o script
  pyautogui.FAILSAFE = True
  pyautogui.PAUSE = 0.05  # Intervalo leve entre comandos para estabilidade

  # Obter dimensões da tela local
  SCREEN_WIDTH, SCREEN_HEIGHT = pyautogui.size()
  print(f"[AGENTE] Resolução da tela detectada: {SCREEN_WIDTH}x{SCREEN_HEIGHT}")

  def validate_and_parse_command(message_str):
      try:
          msg = json.loads(message_str)
      except ValueError:
          return None, "Erro de JSON inválido"
      
      msg_type = msg.get("type")
      if not msg_type:
          return None, "Tipo ausente"
      
      if msg_type == "mousemove":
          x = msg.get("x")
          y = msg.get("y")
          if x is None or y is None:
              return None, "Coordenadas ausentes"
          return ("mousemove", float(x), float(y)), None
      elif msg_type in ["mousedown", "mouseup", "click"]:
          btn = msg.get("button", "left")
          if btn not in ["left", "right", "middle"]:
              return None, "Botão inválido"
          return (msg_type, btn), None
      elif msg_type == "scroll":
          delta = msg.get("deltaY", 0)
          return ("scroll", int(delta)), None
      elif msg_type in ["keydown", "keyup"]:
          key = msg.get("key")
          if not key:
              return None, "Tecla ausente"
          return (msg_type, str(key)), None
      
      return None, "Tipo desconhecido"

  async def handle_client(websocket):
      print("[AGENTE] Transmissor conectado ao agente local.")
      try:
          async for message in websocket:
              cmd, err = validate_and_parse_command(message)
              if err:
                  print(f"[AGENTE] Comando inválido recebido: {err} ({message})")
                  continue
              
              action = cmd[0]
              
              if action == "mousemove":
                  _, rx, ry = cmd
                  # Mapear coordenadas de 0.0-1.0 para resolução absoluta da tela
                  abs_x = int(rx * SCREEN_WIDTH)
                  abs_y = int(ry * SCREEN_HEIGHT)
                  pyautogui.moveTo(abs_x, abs_y)
              
              elif action == "click":
                  _, button = cmd
                  pyautogui.click(button=button)
              
              elif action == "mousedown":
                  _, button = cmd
                  pyautogui.mouseDown(button=button)
              
              elif action == "mouseup":
                  _, button = cmd
                  pyautogui.mouseUp(button=button)
              
              elif action == "scroll":
                  _, delta_y = cmd
                  # pyautogui.scroll aceita valores positivos para cima e negativos para baixo
                  # deltaY no JS é positivo para rolagem para baixo, inverte o sinal
                  pyautogui.scroll(-delta_y)
              
              elif action == "keydown":
                  _, key = cmd
                  # Mapear algumas teclas especiais se necessário
                  pyautogui.keyDown(key)
              
              elif action == "keyup":
                  _, key = cmd
                  pyautogui.keyUp(key)
                  
      except websockets.exceptions.ConnectionClosed:
          print("[AGENTE] Transmissor desconectou do agente local.")
      except Exception as e:
          print(f"[AGENTE] Erro durante a conexão: {e}")

  async def main():
      print("[AGENTE] Iniciando servidor WebSocket local na porta 9000...")
      async with websockets.serve(handle_client, "127.0.0.1", 9000):
          await asyncio.Future()  # Executa para sempre

  if __name__ == "__main__":
      try:
          asyncio.run(main())
      except KeyboardInterrupt:
          print("\n[AGENTE] Encerrado pelo usuário.")
  ```

- [ ] **Step 4: Rodar o teste para verificar se passa**
  Comando: `pytest test_agent.py`
  Esperado: PASS

- [ ] **Step 5: Fazer o commit**
  ```bash
  git add agent.py test_agent.py
  git commit -m "feat: implementar agente local Python com WebSocket e controle de mouse/teclado"
  ```

---

### Task 2: Estrutura HTML (`index.html`)

**Files:**
- Create: `index.html`

- [ ] **Step 1: Criar o arquivo HTML unificado**
  Definir a marcação HTML para o aplicativo. Deve conter um Hub Inicial com seleção de modo (Transmitir vs Controlar), o painel do Streamer (com botão de captura e status do WebSocket) e o painel do Viewer (com player de vídeo, input de ID de conexão e controles adicionais).

  ```html
  <!DOCTYPE html>
  <html lang="pt-BR">
  <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>TeleStream Remote - Transmissão e Controle de Tela</title>
      <link rel="stylesheet" href="styles.css">
      <link rel="preconnect" href="https://fonts.googleapis.com">
      <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
      <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800&display=swap" rel="stylesheet">
      <!-- PeerJS Library para WebRTC P2P -->
      <script src="https://unpkg.com/peerjs@1.5.2/dist/peerjs.min.js" defer></script>
      <script src="app.js" defer></script>
  </head>
  <body>
      <div class="app-container">
          <!-- Hub Inicial -->
          <header class="app-header">
              <h1>TeleStream <span>Remote</span></h1>
              <p>Compartilhamento de tela ultra-rápido com controle remoto via navegador</p>
          </header>

          <main class="app-main">
              <!-- Menu de Seleção de Modo -->
              <div id="mode-selector" class="card fade-in">
                  <h2>Como você deseja começar?</h2>
                  <div class="modes-grid">
                      <button id="btn-select-streamer" class="mode-btn">
                          <div class="mode-icon">📺</div>
                          <h3>Transmitir Minha Tela</h3>
                          <p>Gere um link/ID para outra pessoa assistir e controlar este computador remotamente.</p>
                      </button>
                      <button id="btn-select-viewer" class="mode-btn">
                          <div class="mode-icon">🎮</div>
                          <h3>Controlar uma Tela</h3>
                          <p>Insira um ID de conexão para assistir e interagir com outra máquina.</p>
                      </button>
                  </div>
              </div>

              <!-- Painel do Transmissor (Streamer) -->
              <div id="panel-streamer" class="card fade-in hidden">
                  <div class="panel-header">
                      <button class="btn-back">← Voltar</button>
                      <h2>Painel do Transmissor</h2>
                  </div>
                  
                  <div class="status-grid">
                      <div class="status-item">
                          <span class="status-label">Agente Local Python:</span>
                          <span id="agent-status" class="badge badge-red">Desconectado</span>
                      </div>
                      <div class="status-item">
                          <span class="status-label">ID de Conexão:</span>
                          <span id="streamer-id-display" class="badge badge-gray">Aguardando...</span>
                      </div>
                  </div>

                  <div class="action-section">
                      <button id="btn-start-stream" class="btn btn-primary">Começar Transmissão</button>
                      <button id="btn-stop-stream" class="btn btn-danger hidden">Parar Transmissão</button>
                  </div>

                  <div class="instructions-card">
                      <h4>💡 Próximos Passos:</h4>
                      <ol>
                          <li>Certifique-se de estar rodando o agente Python local (<code>python agent.py</code>).</li>
                          <li>Clique em <strong>"Começar Transmissão"</strong> e selecione a tela inteira a ser compartilhada.</li>
                          <li>Compartilhe o ID gerado com quem irá controlar seu PC.</li>
                      </ol>
                  </div>
                  <video id="local-video-preview" autoplay muted playsinline class="video-preview hidden"></video>
              </div>

              <!-- Painel do Visualizador (Viewer) -->
              <div id="panel-viewer" class="card fade-in hidden">
                  <div class="panel-header">
                      <button class="btn-back">← Voltar</button>
                      <h2>Painel de Visualização & Controle</h2>
                  </div>

                  <div class="viewer-connection-bar">
                      <input type="text" id="input-target-id" placeholder="Insira o ID do Transmissor (ex: telestream-xxxx)">
                      <button id="btn-connect-stream" class="btn btn-primary">Conectar</button>
                      <button id="btn-disconnect-stream" class="btn btn-danger hidden">Desconectar</button>
                  </div>

                  <div id="viewer-control-bar" class="viewer-control-bar hidden">
                      <div class="status-item">
                          <span class="status-label">Status:</span>
                          <span id="connection-status" class="badge badge-gray">Desconectado</span>
                      </div>
                      <label class="switch-container">
                          <input type="checkbox" id="toggle-control-enabled">
                          <span class="slider"></span>
                          Habilitar Controle Remoto
                      </label>
                  </div>

                  <div class="video-container" id="video-container">
                      <div class="video-placeholder" id="video-placeholder">
                          <span>Nenhuma conexão ativa. Insira o ID acima para conectar.</span>
                      </div>
                      <video id="remote-video" autoplay playsinline class="hidden"></video>
                  </div>
              </div>
          </main>
          
          <footer class="app-footer">
              <p>TeleStream Remote. Hospedado no GitHub Pages.</p>
          </footer>
      </div>
  </body>
  </html>
  ```

- [ ] **Step 2: Fazer o commit**
  ```bash
  git add index.html
  git commit -m "feat: criar estrutura HTML de TeleStream Remote com hub e painéis"
  ```

---

### Task 3: Estilização Visual (`styles.css`)

**Files:**
- Create: `styles.css`

- [ ] **Step 1: Criar folha de estilo moderna com Modo Escuro**
  Implementar o design visual. Deve conter variáveis de cor (neon roxo e azul, cinzas escuros), bordas com gradiente, efeitos de desfoque de fundo (backdrop-filter para glassmorphism), e layouts responsivos para a grade e o player de vídeo.

  ```css
  :root {
      --bg-dark: #0f0c1b;
      --card-bg: rgba(26, 21, 44, 0.65);
      --border-color: rgba(255, 255, 255, 0.08);
      --text-main: #f3effa;
      --text-muted: #a49cb5;
      --primary: #9d4edd;
      --primary-glow: rgba(157, 78, 221, 0.4);
      --secondary: #240046;
      --accent-cyan: #4cc9f0;
      --accent-red: #f72585;
      --accent-green: #4ade80;
      --font-family: 'Outfit', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  }

  * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
  }

  body {
      background-color: var(--bg-dark);
      background-image: 
          radial-gradient(at 10% 10%, rgba(123, 44, 191, 0.15) 0px, transparent 50%),
          radial-gradient(at 90% 90%, rgba(76, 201, 240, 0.1) 0px, transparent 50%);
      color: var(--text-main);
      font-family: var(--font-family);
      min-height: 100vh;
      display: flex;
      justify-content: center;
      align-items: center;
      padding: 20px;
      overflow-x: hidden;
  }

  .app-container {
      width: 100%;
      max-width: 1000px;
      display: flex;
      flex-direction: column;
      gap: 30px;
  }

  .app-header {
      text-align: center;
  }

  .app-header h1 {
      font-size: 2.8rem;
      font-weight: 800;
      letter-spacing: -1px;
      margin-bottom: 8px;
  }

  .app-header h1 span {
      background: linear-gradient(135deg, var(--accent-cyan), var(--primary));
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
  }

  .app-header p {
      color: var(--text-muted);
      font-size: 1.1rem;
      font-weight: 300;
  }

  .card {
      background: var(--card-bg);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      border: 1px solid var(--border-color);
      border-radius: 24px;
      padding: 30px;
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.4);
      display: flex;
      flex-direction: column;
      gap: 25px;
  }

  h2 {
      font-size: 1.8rem;
      font-weight: 600;
      text-align: center;
  }

  .modes-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;
      margin-top: 10px;
  }

  @media (max-width: 768px) {
      .modes-grid {
          grid-template-columns: 1fr;
      }
  }

  .mode-btn {
      background: rgba(255, 255, 255, 0.02);
      border: 1px solid rgba(255, 255, 255, 0.05);
      border-radius: 20px;
      padding: 30px 20px;
      color: var(--text-main);
      cursor: pointer;
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      gap: 15px;
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  }

  .mode-btn:hover {
      background: rgba(255, 255, 255, 0.05);
      border-color: var(--primary);
      box-shadow: 0 0 20px var(--primary-glow);
      transform: translateY(-4px);
  }

  .mode-icon {
      font-size: 3rem;
  }

  .mode-btn h3 {
      font-size: 1.3rem;
      font-weight: 600;
  }

  .mode-btn p {
      color: var(--text-muted);
      font-size: 0.9rem;
      line-height: 1.4;
  }

  .panel-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 1px solid rgba(255, 255, 255, 0.05);
      padding-bottom: 15px;
  }

  .btn-back {
      background: transparent;
      border: none;
      color: var(--accent-cyan);
      cursor: pointer;
      font-family: var(--font-family);
      font-size: 1rem;
      font-weight: 600;
      transition: opacity 0.2s;
  }

  .btn-back:hover {
      opacity: 0.8;
  }

  .status-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 15px;
  }

  .status-item {
      background: rgba(0, 0, 0, 0.2);
      padding: 15px;
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 0.95rem;
  }

  .status-label {
      color: var(--text-muted);
  }

  .badge {
      padding: 4px 10px;
      border-radius: 8px;
      font-weight: 600;
      font-size: 0.85rem;
  }

  .badge-red {
      background-color: rgba(247, 37, 133, 0.2);
      color: var(--accent-red);
  }

  .badge-green {
      background-color: rgba(74, 222, 128, 0.2);
      color: var(--accent-green);
  }

  .badge-gray {
      background-color: rgba(255, 255, 255, 0.1);
      color: var(--text-main);
  }

  .btn {
      padding: 12px 24px;
      border-radius: 12px;
      border: none;
      font-family: var(--font-family);
      font-size: 1rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s ease;
      display: inline-flex;
      justify-content: center;
      align-items: center;
  }

  .btn-primary {
      background: linear-gradient(135deg, var(--primary), #7b2cbf);
      color: white;
  }

  .btn-primary:hover {
      opacity: 0.9;
      box-shadow: 0 0 15px var(--primary-glow);
  }

  .btn-danger {
      background: var(--accent-red);
      color: white;
  }

  .btn-danger:hover {
      opacity: 0.9;
  }

  .action-section {
      display: flex;
      justify-content: center;
      margin: 10px 0;
  }

  .instructions-card {
      background: rgba(76, 201, 240, 0.05);
      border-left: 4px solid var(--accent-cyan);
      padding: 15px 20px;
      border-radius: 0 16px 16px 0;
      font-size: 0.95rem;
  }

  .instructions-card h4 {
      color: var(--accent-cyan);
      margin-bottom: 8px;
  }

  .instructions-card ol {
      margin-left: 20px;
      color: var(--text-muted);
      line-height: 1.6;
  }

  .video-preview {
      width: 100%;
      max-height: 250px;
      background: black;
      border-radius: 12px;
      object-fit: contain;
      border: 1px solid var(--border-color);
  }

  /* Viewer styles */
  .viewer-connection-bar {
      display: flex;
      gap: 10px;
  }

  .viewer-connection-bar input {
      flex: 1;
      background: rgba(0, 0, 0, 0.2);
      border: 1px solid var(--border-color);
      border-radius: 12px;
      padding: 12px 20px;
      color: var(--text-main);
      font-family: var(--font-family);
      font-size: 1rem;
      outline: none;
      transition: border-color 0.2s;
  }

  .viewer-connection-bar input:focus {
      border-color: var(--accent-cyan);
  }

  .viewer-control-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: rgba(255, 255, 255, 0.02);
      padding: 10px 20px;
      border-radius: 12px;
      border: 1px solid var(--border-color);
  }

  /* Switch */
  .switch-container {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      cursor: pointer;
      font-size: 0.95rem;
      user-select: none;
  }

  .switch-container input {
      display: none;
  }

  .slider {
      position: relative;
      width: 44px;
      height: 22px;
      background-color: rgba(255, 255, 255, 0.1);
      border-radius: 22px;
      transition: .4s;
  }

  .slider:before {
      position: absolute;
      content: "";
      height: 16px;
      width: 16px;
      left: 3px;
      bottom: 3px;
      background-color: white;
      border-radius: 50%;
      transition: .4s;
  }

  input:checked + .slider {
      background-color: var(--accent-green);
  }

  input:checked + .slider:before {
      transform: translateX(22px);
  }

  /* Video container with cursor lock capabilities */
  .video-container {
      position: relative;
      width: 100%;
      aspect-ratio: 16/9;
      background: #000;
      border-radius: 16px;
      overflow: hidden;
      border: 1px solid var(--border-color);
      display: flex;
      align-items: center;
      justify-content: center;
  }

  .video-placeholder {
      color: var(--text-muted);
      font-size: 1rem;
      text-align: center;
      padding: 20px;
  }

  #remote-video {
      width: 100%;
      height: 100%;
      object-fit: contain;
      cursor: crosshair;
  }

  /* Helper utilities */
  .hidden {
      display: none !important;
  }

  .fade-in {
      animation: fadeIn 0.3s ease-out forwards;
  }

  @keyframes fadeIn {
      from { opacity: 0; transform: translateY(8px); }
      to { opacity: 1; transform: translateY(0); }
  }

  .app-footer {
      text-align: center;
      color: var(--text-muted);
      font-size: 0.85rem;
      font-weight: 300;
  }
  ```

- [ ] **Step 2: Fazer o commit**
  ```bash
  git add styles.css
  git commit -m "feat: criar estilização moderna CSS em modo escuro com glassmorphism"
  ```

---

### Task 4: Lógica JavaScript - Configuração WebRTC e Streamer (`app.js` Parte 1)

**Files:**
- Create: `app.js`

- [ ] **Step 1: Criar a lógica do painel, gerenciador de navegação e WebSocket do Agente**
  Criar a primeira metade do arquivo `app.js` contendo a navegação entre telas, a lógica para tentar se conectar ao websocket local rodando na porta 9000 e a inicialização da conexão WebRTC do PeerJS no modo Streamer.

  ```javascript
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
          if (localAgentSocket && localAgentSocket.readyState === WebSocket.OPEN) return;

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
              // Tenta reconectar a cada 5 segundos
              setTimeout(connectLocalAgent, 5000);
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
                      // Se o websocket local estiver aberto, encaminha os comandos de input
                      if (localAgentSocket && localAgentSocket.readyState === WebSocket.OPEN) {
                          localAgentSocket.send(JSON.stringify(data));
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
                      console.warn('[STREAMER] Nenhuma stream de vídeo local ativa para responder a chamada.');
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
              localStream = await navigator.mediaDevices.getDisplayMedia({
                  video: {
                      cursor: "always",
                      frameRate: { ideal: 30, max: 60 }
                  },
                  audio: false
              });

              localVideoPreview.srcObject = localStream;
              localVideoPreview.classList.remove('hidden');
              
              btnStartStream.classList.add('hidden');
              btnStopStream.classList.remove('hidden');

              // Se a stream for interrompida pelo botão flutuante nativo do navegador
              localStream.getVideoTracks()[0].onended = () => {
                  stopStream();
              };

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
          localVideoPreview.srcObject = null;
          localVideoPreview.classList.add('hidden');
          
          btnStartStream.classList.remove('hidden');
          btnStopStream.classList.add('hidden');
          console.log('[STREAMER] Transmissão parada.');
      }
  ```

- [ ] **Step 2: Fazer o commit**
  ```bash
  git add app.js
  git commit -m "feat: iniciar lógica app.js com hub e WebRTC para Streamer"
  ```

---

### Task 5: Lógica JavaScript - Viewer & Envio de Inputs (`app.js` Parte 2)

**Files:**
- Modify: `app.js`

- [ ] **Step 1: Completar o arquivo `app.js` com a lógica do visualizador e captura de inputs**
  Adicionar a parte correspondente à conexão com a stream e o envio dos comandos do mouse/teclado de maneira coordenada.

  ```javascript
  // TargetContent a ser editado em app.js (Adicionar ao final do arquivo)
  // ... resto do código da Task 4 ...
  ```

  Replacement content para a segunda parte de `app.js`:

  ```javascript
      // --- Lógica do Visualizador (Viewer) ---
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
          currentDataConnection = peer.connect(targetId);

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
          
          // Como o viewer não transmite nada, enviamos uma stream vazia ou usamos chamada unidirecional.
          // Com PeerJS, chamamos com uma stream dummy se necessário, mas podemos passar uma stream vazia
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
          if (localAgentSocket) {
              localAgentSocket.close();
              localAgentSocket = null;
          }
          if (peer) {
              peer.destroy();
              peer = null;
          }
      }

      // --- Captura de Eventos de Input no Vídeo ---
      function sendControlEvent(eventObj) {
          if (!toggleControlEnabled.checked) return;
          if (currentDataConnection && currentDataConnection.open) {
              currentDataConnection.send(eventObj);
          }
      }

      // 1. Mouse Move e Cliques
      remoteVideo.addEventListener('mousemove', (e) => {
          const rect = remoteVideo.getBoundingClientRect();
          // Calcular a posição relativa do clique dentro do elemento de vídeo em si
          const rx = (e.clientX - rect.left) / rect.width;
          const ry = (e.clientY - rect.top) / rect.height;

          // Limitar coordenadas entre 0.0 e 1.0 para evitar desbordamento de tela
          const x = Math.max(0, Math.min(1, rx));
          const y = Math.max(0, Math.min(1, ry));

          sendControlEvent({
              type: 'mousemove',
              x: x,
              y: y
          });
      });

      // Mapeamento dos botões do mouse
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

      // Desativar menu de contexto do botão direito sobre o vídeo para permitir cliques com botão direito
      remoteVideo.addEventListener('contextmenu', (e) => {
          if (toggleControlEnabled.checked) {
              e.preventDefault();
          }
      });

      // 2. Rolagem de tela (Scroll)
      remoteVideo.addEventListener('wheel', (e) => {
          if (toggleControlEnabled.checked) {
              e.preventDefault(); // Evita a rolagem na própria janela do visualizador
              sendControlEvent({
                  type: 'scroll',
                  deltaY: e.deltaY
              });
          }
      }, { passive: false });

      // 3. Captura do Teclado (Focada no elemento do player de vídeo)
      // Para o vídeo capturar teclas, ele deve ter a propriedade tabIndex ou o listener estar na janela
      // Vamos colocar o listener na janela se e somente se o mouse estiver sobre o vídeo ou se o controle estiver ligado.
      let mouseOverVideo = false;
      remoteVideo.addEventListener('mouseenter', () => { mouseOverVideo = true; });
      remoteVideo.addEventListener('mouseleave', () => { mouseOverVideo = false; });

      // Mapeamento de chaves especiais do JavaScript para PyAutoGUI
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
          
          // Impede comportamento padrão de rolagem de teclas como barra de espaço ou setas
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
  ```

- [ ] **Step 2: Substituir o conteúdo em `app.js` e salvar**
  Integrar as duas metades em `app.js`.

- [ ] **Step 3: Fazer o commit**
  ```bash
  git add app.js
  git commit -m "feat: implementar lógica do Viewer, captura e envio de eventos no app.js"
  ```

---

### Task 6: Documentação de Inicialização (`README.md`)

**Files:**
- Create: `README.md`

- [ ] **Step 1: Criar o arquivo README.md com instruções passo a passo**
  Escrever instruções claras de instalação das dependências Python (`pyautogui`, `websockets`), execução do agente local e como subir a interface no GitHub Pages.

  ```markdown
  # TeleStream Remote 📺🎮

  Um sistema leve e de alta performance de transmissão e controle remoto de tela, projetado para rodar diretamente do navegador (hospedado no GitHub Pages) auxiliado por um script Python leve rodando localmente na máquina compartilhada.

  ## Como funciona?
  1. A captura e codificação de vídeo de tela são tratadas nativamente pelo navegador via **WebRTC (P2P)** usando a infraestrutura pública gratuita do **PeerJS**.
  2. Os cliques, movimentos de mouse e toques de teclado são enviados do visualizador (Viewer) para o transmissor (Streamer) diretamente.
  3. O navegador do transmissor repassa as ações recebidas para o script local `agent.py` via **WebSocket (`localhost:9000`)**.
  4. O script Python simula os comandos em nível de sistema usando a biblioteca `pyautogui`.

  ## Requisitos
  Na máquina que irá **transmitir** a tela e ser controlada, você precisará ter o Python 3 instalado e as seguintes bibliotecas:

  ```bash
  pip install pyautogui websockets pytest
  ```

  ## Como Utilizar

  ### 1. Preparando o Transmissor (Quem compartilha a tela)
  1. Clone o repositório ou baixe os arquivos em sua máquina.
  2. Inicie o agente auxiliar de controle remoto no terminal:
     ```bash
     python agent.py
     ```
  3. Abra a interface web (hospedada no GitHub Pages, ou abra o arquivo `index.html` localmente).
  4. Clique em **"Transmitir Minha Tela"**.
  5. Você verá o indicador do "Agente Local Python" ficar verde (**Conectado**).
  6. Clique em **"Começar Transmissão"** e escolha a tela cheia ou janela que deseja compartilhar.
  7. Copie o ID gerado (ex: `telestream-xxxxxx`) e envie-o para a pessoa que irá te controlar.

  ### 2. Conectando como Visualizador (Quem assiste/controla)
  1. Abra a mesma página da web hospedada no GitHub Pages.
  2. Clique em **"Controlar uma Tela"**.
  3. Cole o ID do transmissor no campo de entrada e clique em **"Conectar"**.
  4. O vídeo da tela remota será exibido.
  5. Marque a caixa de seleção **"Habilitar Controle Remoto"** e mova o mouse ou clique sobre o vídeo para interagir com a máquina remota!

  ## Failsafe de Segurança (Parada de Emergência)
  Como o script Python simula o mouse e o teclado, se por qualquer motivo você perder o controle das coordenadas, o **PyAutoGUI** possui uma trava de segurança ativada por padrão:
  *   **Mova agressivamente o cursor do mouse físico da sua máquina para qualquer um dos quatro cantos extremos da sua tela principal**. Isso lançará uma exceção no script Python e abortará a simulação de comandos imediatamente.
  ```

- [ ] **Step 2: Fazer o commit**
  ```bash
  git add README.md
  git commit -m "docs: adicionar documentação de uso e instalação no README.md"
  ```
