// Node 에서 data/*.js 를 브라우저와 같은 방식으로 읽어 온다.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const DATA = path.join(__dirname, '..', 'data');

function makeContext() {
  const sandbox = {};
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  return sandbox;
}

function run(sandbox, f) {
  vm.runInContext(fs.readFileSync(path.join(DATA, f), 'utf8'), sandbox, { filename: f });
}

/** dict 사전을 쓰는 데 필요한 파일(메타, 그래프, 표시 단어)을 읽는다 */
function loadDict(dictId) {
  const sb = makeContext();
  run(sb, 'meta.js');
  const d = sb.window.KM.meta.dicts.find(x => x.id === dictId);
  if (!d) throw new Error('no dict ' + dictId);
  run(sb, d.graph);
  d.wordFiles.forEach(f => run(sb, f));
  return { KM: sb.window.KM, dict: d };
}

module.exports = { loadDict, DATA };
