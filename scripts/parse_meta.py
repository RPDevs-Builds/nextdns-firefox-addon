import re
import json
import os
from datetime import datetime

def parse_relative_date(date_str):
    # Convert "Updated 2 days ago" to a comparable timestamp
    now = datetime.now().timestamp()
    match = re.search(r'(\d+)\s+(day|hour|month|year|minute)', date_str)
    if not match: return now
    
    val, unit = int(match.group(1)), match.group(2)
    multipliers = {
        'minute': 60,
        'hour': 3600,
        'day': 86400,
        'month': 2592000,
        'year': 31536000
    }
    return now - (val * multipliers.get(unit, 0))

def parse_blocklists():
    if not os.path.exists('.source/blocklists.html'):
        return []
        
    with open('.source/blocklists.html', 'r') as f:
        content = f.read()
    
    blocks = []
    # Precision parsing
    items = re.findall(r'<div class="notranslate" style="font-weight: 500;">(.*?)</div>.*?<div class="mt-1" style="font-size: 0.9em; opacity: 0.5;">(.*?)</div>.*?<span style="opacity: 0.4;">(.*?) entries</span>.*?<span style="opacity: 0.4;">Updated (.*?)</span>', content, re.DOTALL)
    
    seen = set()
    for name, desc, entries, updated in items:
        name = name.strip()
        if name in seen: continue
        seen.add(name)
        
        id_ = name.lower().replace(' & ', '-').replace(' ', '-').replace('.', '').replace("'", '').replace('(', '').replace(')', '')
        if "nextdns-ads--trackers-blocklist" in id_: id_ = "nextdns-recommended"
        
        # Clean numeric entries
        entry_val = entries.replace(',', '').replace(' ', '')
        entry_count = int(entry_val) if entry_val.isdigit() else 0
        
        blocks.append({
            "id": id_,
            "name": name,
            "description": desc.strip(),
            "entries_text": f"{entries.strip()} entries",
            "entries": entry_count,
            "updated_text": f"Updated {updated.strip()}",
            "updated_ts": parse_relative_date(updated),
            "popularity": 0 
        })
    
    # Popularity proxy: original list order
    for idx, b in enumerate(blocks):
        b["popularity"] = len(blocks) - idx
        
    return blocks

def parse_parental_services():
    if not os.path.exists('.source/websiteapporgame.html'):
        return []
    with open('.source/websiteapporgame.html', 'r') as f:
        content = f.read()
    services = []
    items = re.findall(r'<span class="notranslate" style="font-weight: 500;">(.*?)</span>', content)
    seen = set()
    for name in items:
        name = name.strip()
        if name in seen: continue
        seen.add(name)
        id_ = name.lower().replace(' ', '-')
        norm = {"Disney+": "disneyplus", "HBO Max": "hbomax", "Prime Video": "primevideo", "Xbox Live": "xboxlive", "PlayStation Network": "playstation-network", "YouTube": "youtube"}
        id_ = norm.get(name, id_)
        services.append({"id": id_, "name": name})
    return services

def parse_tlds():
    if not os.path.exists('.source/tlds.html'):
        return []
    with open('.source/tlds.html', 'r') as f:
        content = f.read()
    tlds = re.findall(r'<span class="notranslate" style="font-weight: 500; margin-left: -4px;">\.(.*?)</span>', content)
    return sorted(list(set(tlds)))

meta = {
    "blocklists": parse_blocklists(),
    "parental_services": parse_parental_services(),
    "tlds": parse_tlds(),
    "categories": [
        {"id": "porn", "name": "Porn", "description": "Blocks adult and pornographic content."},
        {"id": "gambling", "name": "Gambling", "description": "Blocks gambling content."},
        {"id": "dating", "name": "Dating", "description": "Blocks all dating websites & apps."},
        {"id": "piracy", "name": "Piracy", "description": "Blocks P2P websites, protocols, etc."},
        {"id": "social-networks", "name": "Social Networks", "description": "Blocks all social networks sites and apps."},
        {"id": "gaming", "name": "Online Gaming", "description": "Blocks online gaming websites and networks."},
        {"id": "video-streaming", "name": "Video Streaming", "description": "Blocks video streaming services."}
    ],
    "last_updated": datetime.now().isoformat()
}

with open('data/blocks_meta.json', 'w') as f:
    json.dump(meta, f, indent=2)

print(f"Meta parsed successfully. Found {len(meta['blocklists'])} blocklists, {len(meta['parental_services'])} services, and {len(meta['tlds'])} TLDs.")
