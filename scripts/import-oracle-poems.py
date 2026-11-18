"""Import only public-domain verse, not modern commentary. Requires beautifulsoup4."""
import re, json, urllib.request, urllib.parse, concurrent.futures
from pathlib import Path
from bs4 import BeautifulSoup

def fetch(n):
    url="https://zh.wikisource.org/zh-hant/"+urllib.parse.quote("關聖帝君靈籤/"+str(n))
    cache=Path('logs/oracle-source');cache.mkdir(parents=True,exist_ok=True)
    file=cache/f'{n}.html'
    html=file.read_bytes() if file.exists() else urllib.request.urlopen(urllib.request.Request(url,headers={"User-Agent":"LiuyaoSourceImporter/1.0"}),timeout=40).read()
    file.write_bytes(html)
    soup=BeautifulSoup(html,"html.parser")
    root=soup.select_one(".mw-parser-output")
    for edit in root.select(".mw-editsection"):edit.decompose()
    lines=[x.strip() for x in root.get_text("\n",strip=True).splitlines() if x.strip()]
    end=next(i for i,x in enumerate(lines) if x.startswith("聖意"))
    verse=[v.strip() for v in re.split(r"[。．，、\n]",re.sub(r"[（(][^）)]*[）)]","","\n".join(lines[2:end]))) if re.fullmatch(r"[\u3400-\u9fff]{7}",v.strip())]
    assert len(verse)==4,(n,lines[:end],verse)
    return {"number":n,"title":lines[0],"poem":verse,"source":url}
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
    poems=list(pool.map(fetch,range(1,101)))
Path("src/divination").mkdir(exist_ok=True)
Path("src/divination/guandi.json").write_text(json.dumps(poems,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
print("Imported",len(poems),"poems")
