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
