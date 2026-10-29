"""Repository-local GitHub Action. No personal credential leaves GitHub.

Collect all non-merge commits on main for the current and two previous
calendar weeks, then sign the snapshot for the dashboard's source inbox.
"""
import hashlib
import hmac
import json
import os
import urllib.parse
import urllib.request
from datetime import datetime, time, timedelta, timezone

# Alberta Time is UTC-6 year-round from Nov 1, 2026. This integration starts
# Oct 29, while Calgary is already UTC-6, so all supported weeks use UTC-6.
LOCAL = timezone(timedelta(hours=-6))


def main():
    repo = os.environ['GITHUB_REPOSITORY']
    token = os.environ['GITHUB_TOKEN']
    secret = os.environ['RELEASE_INGEST_SECRET']
    if not secret:
        raise RuntimeError('Repository release snapshot secret has not been configured.')
    now = datetime.now(timezone.utc)
    local = now.astimezone(LOCAL).date()
    current = local - timedelta(days=local.weekday())
    weeks = []
    for offset in (14,7,0):
        week = current - timedelta(days=offset)
        start = datetime.combine(week,time(),LOCAL).astimezone(timezone.utc)
        end = min(start+timedelta(days=7),now)
        changes = []
        for page in range(1,21):
            query = urllib.parse.urlencode({'sha':'main','since':start.isoformat(),'until':end.isoformat(),'per_page':100,'page':page})
            req = urllib.request.Request(f'https://api.github.com/repos/{repo}/commits?{query}',headers={
                'Authorization':'Bearer '+token,'User-Agent':'RexBot-weekly-source',
                'Accept':'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'})
            with urllib.request.urlopen(req,timeout=20) as response:
                batch = json.load(response)
            for item in batch:
                stamp = datetime.fromisoformat(item['commit']['committer']['date'].replace('Z','+00:00'))
                if start <= stamp < end and len(item.get('parents',[])) <= 1:
                    changes.append({'sha':item['sha'],'subject':' '.join(item['commit']['message'].splitlines()[0].split())[:400]})
            if len(batch)<100:
                break
        else:
            raise RuntimeError('Source snapshot exceeded the complete-collection limit.')
        weeks.append({'week_start':week.isoformat(),'changes':list(reversed(changes))})
    # Captured time denotes the start of collection, never a later week boundary
    # crossed while the API was being paginated.
    body=json.dumps({'repository':repo,'captured_at':now.isoformat(),'weeks':weeks}).encode()
    signature=hmac.new(secret.encode(),body,hashlib.sha256).hexdigest()
    request=urllib.request.Request(os.environ['RELEASE_INGEST_URL'],data=body,method='POST',headers={
        'Content-Type':'application/json','X-Release-Signature':signature})
    with urllib.request.urlopen(request,timeout=30) as response:
        if response.status != 200:
            raise RuntimeError('Weekly source inbox did not accept the snapshot.')
    print(f'Weekly source snapshot accepted: {repo}, {sum(len(w["changes"]) for w in weeks)} commits.')


if __name__=='__main__':
    main()
