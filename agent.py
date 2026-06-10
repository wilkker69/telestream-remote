import asyncio
import websockets
import websockets.exceptions
import json
import pyautogui

# Failsafe de segurança: mover o mouse para qualquer canto cancela o script
pyautogui.FAILSAFE = True
pyautogui.PAUSE = 0.05  # Intervalo leve entre comandos para estabilidade

# Referência ao future para parar o servidor em caso de failsafe
stop_future = None

# Obter dimensões da tela local com fallback headless
try:
    SCREEN_WIDTH, SCREEN_HEIGHT = pyautogui.size()
    print(f"[AGENTE] Resolução da tela detectada: {SCREEN_WIDTH}x{SCREEN_HEIGHT}")
except Exception as e:
    print(f"[AGENTE] [Aviso] Não foi possível detectar resolução da tela: {e}. Usando fallback 1920x1080.")
    SCREEN_WIDTH, SCREEN_HEIGHT = 1920, 1080

def validate_and_parse_command(message_str):
    try:
        msg = json.loads(message_str)
    except ValueError:
        return None, "Erro de JSON inválido"
    
    if not isinstance(msg, dict):
        return None, "Mensagem inválida (esperado objeto JSON)"
    
    msg_type = msg.get("type")
    if not msg_type:
        return None, "Tipo ausente"
    
    if msg_type == "mousemove":
        x = msg.get("x")
        y = msg.get("y")
        if x is None or y is None:
            return None, "Coordenadas ausentes"
        try:
            return ("mousemove", float(x), float(y)), None
        except (ValueError, TypeError):
            return None, "Coordenadas inválidas"
            
    elif msg_type in ["mousedown", "mouseup", "click"]:
        btn = msg.get("button", "left")
        if btn not in ["left", "right", "middle"]:
            return None, "Botão inválido"
        return (msg_type, btn), None
        
    elif msg_type == "scroll":
        delta = msg.get("deltaY", 0)
        try:
            return ("scroll", int(delta)), None
        except (ValueError, TypeError):
            return None, "deltaY inválido"
            
    elif msg_type in ["keydown", "keyup"]:
        key = msg.get("key")
        if not key:
            return None, "Tecla ausente"
        return (msg_type, str(key)), None
    
    return None, "Tipo desconhecido"

async def handle_client(websocket):
    global stop_future
    print("[AGENTE] Transmissor conectado ao agente local.")
    try:
        async for message in websocket:
            cmd, err = validate_and_parse_command(message)
            if err:
                print(f"[AGENTE] Comando inválido recebido: {err} ({message})")
                continue
            
            action = cmd[0]
            try:
                if action == "mousemove":
                    _, rx, ry = cmd
                    # Garante que as coordenadas remotas fiquem entre 1 e SCREEN - 2,
                    # deixando as bordas extremas livres apenas para o mouse físico do host acionar o Failsafe.
                    abs_x = max(1, min(SCREEN_WIDTH - 2, int(rx * SCREEN_WIDTH)))
                    abs_y = max(1, min(SCREEN_HEIGHT - 2, int(ry * SCREEN_HEIGHT)))
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
                    pyautogui.scroll(-delta_y)
                
                elif action == "keydown":
                    _, key = cmd
                    pyautogui.keyDown(key)
                
                elif action == "keyup":
                    _, key = cmd
                    pyautogui.keyUp(key)
            except pyautogui.FailSafeException as failsafe_err:
                print("[AGENTE] Failsafe do PyAutoGUI acionado! Encerrando...")
                # Raise to propagate out of the client handler and terminate
                raise failsafe_err
            except Exception as exec_err:
                print(f"[AGENTE] Erro ao executar comando {cmd}: {exec_err}")
                
    except websockets.exceptions.ConnectionClosed:
        print("[AGENTE] Transmissor desconectou do agente local.")
    except pyautogui.FailSafeException as failsafe_err:
        # Reraise so it propagates to the main runner
        if stop_future and not stop_future.done():
            stop_future.set_exception(failsafe_err)
        raise
    except Exception as e:
        print(f"[AGENTE] Erro durante a conexão: {e}")

async def main():
    global stop_future
    stop_future = asyncio.get_running_loop().create_future()
    print("[AGENTE] Iniciando servidor WebSocket local na porta 9000...")
    async with websockets.serve(handle_client, "127.0.0.1", 9000):
        await stop_future

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n[AGENTE] Encerrado pelo usuário.")
    except pyautogui.FailSafeException:
        print("[AGENTE] Servidor encerrado via Failsafe do PyAutoGUI.")
