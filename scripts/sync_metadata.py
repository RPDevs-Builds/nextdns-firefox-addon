import subprocess
import json
import os
import sys
from datetime import datetime

# Constants
STAGING_DIR = ".staging/nextdns-addon-data"
DATA_FILE = "data/blocks_meta.json"
SOURCE_HTML = ".source/blocklists.html"

# Use environment variable for cookie if available (for GitHub Actions)
# Fallback to the hardcoded one for local dev
DEFAULT_COOKIE = 'pst=s%3AYRHOVOLQYXO6dn8Nm7c1Ni8917vM%2FsXzTDjBMZQsdfc%3D.W%2BWZVNJKOsMcdgq8DhgBo8xk2zGEEGP06Rvb%2B0%2Br31M; sid=s%3Aln6mzmzltsAJPOODcnXm3tBAUb29Tcfe.c226pTP7IjE2%2FN%2FJChfR6V%2F2%2FSa9sKnJUaPg41vFF3U'
COOKIE = os.environ.get('NEXTDNS_COOKIE', DEFAULT_COOKIE)

CURL_COMMAND = [
    'curl', 'https://api.nextdns.io/profiles/889455/privacy',
    '--compressed',
    '-H', 'User-Agent: Mozilla/5.0 (X11; Linux x86_64; rv:151.0) Gecko/20100101 Firefox/151.0',
    '-H', 'Accept: */*',
    '-H', 'Accept-Language: en-US,en;q=0.9',
    '-H', 'Accept-Encoding: gzip, deflate, br, zstd',
    '-H', 'Origin: https://my.nextdns.io',
    '-H', 'Alt-Used: api.nextdns.io',
    '-H', 'Connection: keep-alive',
    '-H', 'Referer: https://my.nextdns.io/',
    '-H', f'Cookie: {COOKIE}',
    '-H', 'Sec-Fetch-Dest: empty',
    '-H', 'Sec-Fetch-Mode: cors',
    '-H', 'Sec-Fetch-Site: same-site',
    '-H', 'TE: trailers'
]

def sync():
    print("Fetching latest privacy settings from NextDNS API...")
    try:
        result = subprocess.run(CURL_COMMAND, capture_output=True, text=True, check=True)
        api_data = json.loads(result.stdout)
        
        staging_path = os.path.join(STAGING_DIR, "data", "privacy_raw.json")
        os.makedirs(os.path.dirname(staging_path), exist_ok=True)
        with open(staging_path, 'w') as f:
            json.dump(api_data, f, indent=2)
        print(f"Raw data saved to {staging_path}")

        print("Running metadata parser...")
        subprocess.run(['python3', 'scripts/parse_meta.py'], check=True)
        print("Metadata sync complete.")
        
    except Exception as e:
        print(f"Error during sync: {e}")
        sys.exit(1)

if __name__ == "__main__":
    sync()
