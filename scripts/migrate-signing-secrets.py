#!/usr/bin/env python3
"""Upload the ORIGINAL key/passwords directly to Actions Secrets without logging them.
Requires a gh identity with permission to manage repository Actions secrets.
"""
import argparse
import re
import subprocess

parser = argparse.ArgumentParser()
parser.add_argument('--repo', default='AdlerDaniel/Playerium')
parser.add_argument('--source-ref', default='8c14ced934f9791539a0d3ddb81a952f571f39c8')
args = parser.parse_args()
subprocess.run(['gh', 'api', f'repos/{args.repo}/actions/secrets/public-key'], check=True, stdout=subprocess.DEVNULL)
def original(path):
    return subprocess.check_output(['git','show',f'{args.source_ref}:{path}'])
gradle = original('android/app/build.gradle').decode()
values = {'PLAYERIUM_KEYSTORE_BASE64': original('android/app/playerium.keystore.b64').strip()}
for secret, field in [('PLAYERIUM_STORE_PASSWORD','storePassword'),('PLAYERIUM_KEY_PASSWORD','keyPassword'),('PLAYERIUM_KEY_ALIAS','keyAlias')]:
    match = re.search(rf'{field}\s+"([^"]+)"', gradle)
    if not match: raise RuntimeError(f'Missing original {field}; refusing to generate another key')
    values[secret] = match[1].encode()
for name, value in values.items():
    subprocess.run(['gh','secret','set',name,'--repo',args.repo],input=value,check=True)
    print(f'{name}: uploaded')
