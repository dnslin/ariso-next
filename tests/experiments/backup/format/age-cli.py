"""Own-fixture age passphrase interoperability through a controlling terminal."""
import errno
import json
import os
import pty
import select
import signal
import sys
import time

job = json.load(sys.stdin)
args = [job['binary'], '-d' if job['mode'] == 'decrypt' else '-p', '-o', job['target'], job['source']]
pid, master = pty.fork()
if pid == 0:
    os.execv(args[0], args)
deadline = time.monotonic() + 60
pending = ''
transcript = ''
prompts = 0
status = None
try:
    while time.monotonic() < deadline:
        ready, _, _ = select.select([master], [], [], 0.1)
        if ready:
            try:
                data = os.read(master, 8192).decode('utf-8', errors='replace')
            except OSError as error:
                if error.errno == errno.EIO:
                    break
                raise
            if not data:
                break
            pending += data
            transcript += data
            if 'passphrase' in pending.lower() and ':' in pending:
                os.write(master, (job['password'] + '\n').encode())
                prompts += 1
                pending = ''
        done, status = os.waitpid(pid, os.WNOHANG)
        if done:
            break
        status = None
    if status is None:
        done, status = os.waitpid(pid, os.WNOHANG)
        if not done:
            os.kill(pid, signal.SIGKILL)
            _, status = os.waitpid(pid, 0)
    code = os.waitstatus_to_exitcode(status)
    result = {'exitCode': code, 'prompts': prompts}
    if code:
        result['diagnostic'] = transcript[-2000:].replace(job['password'], '[fixture password]')
    print(json.dumps(result))
    sys.exit(0 if code == 0 else 1)
finally:
    os.close(master)
