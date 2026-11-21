"""通过 SSH/SFTP 部署当前工程；凭据只从环境变量读取，不写入磁盘。"""
import os
import pathlib
import posixpath
import sys
import time
import paramiko

sys.stdout.reconfigure(encoding='utf-8', errors='replace')
sys.stderr.reconfigure(encoding='utf-8', errors='replace')

ROOT = pathlib.Path(__file__).resolve().parents[1]
HOST = os.environ.get('DEPLOY_HOST', '111.230.228.102')
USER = os.environ.get('DEPLOY_USER', 'ubuntu')
PASSWORD = os.environ.get('DEPLOY_PASSWORD')
REMOTE_DIR = os.environ.get('DEPLOY_DIR', '/home/ubuntu/tongchuang-credit-system')
EXCLUDED = {'node_modules', 'dist', 'data', '.git', '.deploy', '__pycache__'}


def connect():
    if not PASSWORD:
        raise RuntimeError('请通过 DEPLOY_PASSWORD 环境变量提供 SSH 密码')
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(HOST, port=22, username=USER, password=PASSWORD, timeout=20)
    return client


def run(client, command, timeout=1200):
    print(f'REMOTE> {command}', flush=True)
    _, stdout, stderr = client.exec_command(command, timeout=timeout)
    out = stdout.read().decode('utf-8', errors='replace')
    err = stderr.read().decode('utf-8', errors='replace')
    status = stdout.channel.recv_exit_status()
    if out:
        print(out, flush=True)
    if err:
        print(err, file=sys.stderr, flush=True)
    if status:
        raise RuntimeError(f'远端命令退出码 {status}')
    return out


def mkdir(sftp, directory):
    parts = directory.strip('/').split('/')
    current = ''
    for part in parts:
        current += '/' + part
        try:
            sftp.stat(current)
        except FileNotFoundError:
            sftp.mkdir(current)


def upload(client):
    sftp = client.open_sftp()
    mkdir(sftp, REMOTE_DIR)
    count = 0
    for local in ROOT.rglob('*'):
        relative = local.relative_to(ROOT)
        if any(part in EXCLUDED or part.endswith('.log') for part in relative.parts):
            continue
        is_public_icon = 'public' in relative.parts and 'icons' in relative.parts and local.suffix.lower() in {'.png', '.ico'}
        if local.is_dir() or (local.suffix.lower() in {'.png', '.ico', '.log'} and not is_public_icon):
            continue
        remote = posixpath.join(REMOTE_DIR, relative.as_posix())
        mkdir(sftp, posixpath.dirname(remote))
        sftp.put(str(local), remote)
        count += 1
    sftp.close()
    print(f'已上传 {count} 个工程文件到 {REMOTE_DIR}', flush=True)


def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else 'inspect'
    client = connect()
    try:
        if mode == 'inspect':
            run(client, 'echo HOST=$(hostname); echo USER=$(whoami); uname -a; command -v docker || true; docker --version 2>/dev/null || true; docker compose version 2>/dev/null || true; docker info 2>/dev/null | grep -E "Server Version|Storage Driver" || true; ss -ltn | grep ":3005" || true; df -h /; free -h')
        elif mode == 'deploy':
            upload(client)
            run(client, 'docker info >/dev/null 2>&1 || sudo -n docker info >/dev/null')
            unit = f'tongchuang-deploy-{int(time.time())}'
            run(client, f"sudo -n systemd-run --unit={unit} --collect --working-directory={REMOTE_DIR} sh -c 'rm -f deploy.log deploy.exit; docker compose up -d --build > deploy.log 2>&1; echo $? > deploy.exit'")
            print(f'远端构建任务：{unit}', flush=True)
        elif mode == 'status':
            run(client, f"cd {REMOTE_DIR}; if test -f deploy.exit; then echo BUILD_EXIT=$(cat deploy.exit); else echo BUILD_IN_PROGRESS; fi; tail -n 35 deploy.log 2>/dev/null || true; echo BUILD_PROCESSES; pgrep -af 'docker compose|apk|buildkit' || true; sudo -n docker compose ps; curl -fsS http://127.0.0.1:3005/api/health 2>/dev/null || true")
        elif mode == 'health':
            run(client, f'cd {REMOTE_DIR} && sudo -n docker compose ps && curl -fsS http://127.0.0.1:3005/api/health')
        else:
            raise RuntimeError('mode 仅支持 inspect、deploy、status 或 health')
    finally:
        client.close()


if __name__ == '__main__':
    main()
