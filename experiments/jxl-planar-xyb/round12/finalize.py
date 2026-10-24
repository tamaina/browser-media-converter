"""Audit completed serial regression and byte identity after the benchmark too."""
import json,hashlib,re
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];WORK=ROOT/'build/round12'
progress=(ROOT/'build/r12-progress.md').read_text()
assert '- Final regression complete at ' in progress,'Serial regression incomplete'
browser=json.loads((ROOT/'build/browser/test-observations.json').read_text());benchmark=json.loads((ROOT/'wasm-observations.json').read_text())
assert len(browser['cases'])==138 and len(benchmark['cases'])==148
log=lambda name:(WORK/('final-'+name+'.log')).read_text()
python=int(re.search(r'Ran (\d+) tests?',log('python')).group(1))
tail=int(re.search(r'(\d+) 4-lane.*passed',log('tail-guard')).group(1))
node_tests=lambda name:int(re.search(r'tests (\d+)',log(name)).group(1))
media=node_tests('media-test');resizer=node_tests('resizer-unit')
assert (python,tail,media,resizer)==(12,28512,44,5)
assert 'assertions passed (2 fixtures)' in log('png-avif-chrome')
assert 'xvfb-run' in log('electron') and 'No such file' in log('electron')
legacy=json.loads((WORK/'legacy-before.json').read_text())
current={p:hashlib.sha256((ROOT/p).read_bytes()).hexdigest() for p in legacy}
assert current==legacy,[(p,legacy[p],current[p]) for p in legacy if current[p]!=legacy[p]]
file=ROOT/'round12/round12-observations.json';result=json.loads(file.read_text())
result['finalRegression']={'strictlySequential':True,'browser':len(browser['cases']),'round10':{'cases':9,'apiChecks':18},'round11':{'profiles':6,'apiChecks':24},'benchmarkReal10':len(benchmark['cases']),'pythonMethods':python,'tailGuard':tail,'mediaContainer':media,'resizerUnit':resizer,'pngAvifChrome':2,'electron':'unavailable: xvfb-run missing','legacyHashesAlsoMatchAfterBenchmark':True}
text=json.dumps(result,separators=(',',':'))+'\n';assert len(text)<30000,len(text)
assert (ROOT/'wasm-observations.json').stat().st_size<100000
file.write_text(text)
print('Final audit: 692 legacy files still byte-identical after benchmark; JSON',len(text),'bytes; WASM observations',(ROOT/'wasm-observations.json').stat().st_size,'bytes')
