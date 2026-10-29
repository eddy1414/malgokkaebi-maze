"""Python port of ggeugle's classify()/getDepthMap() (bipartite char/head model)."""
import collections

RIEUL_TO_NIEUN = [4449, 4450, 4457, 4460, 4462, 4467]
RIEUL_TO_IEUNG = [4451, 4455, 4456, 4461, 4466, 4469]
NIEUN_TO_IEUNG = [4455, 4461, 4466, 4469]


def sub(ch):
    k = ord(ch) - 0xAC00
    if k < 0 or k > 11171:
        return None
    a, b, c = k // 28 // 21, (k // 28) % 21, k % 28
    A, B = a + 0x1100, b + 0x1161
    if A == 4357:
        if B in RIEUL_TO_NIEUN: A = 4354
        elif B in RIEUL_TO_IEUNG: A = 4363
        else: return None
    elif A == 4354:
        if B in NIEUN_TO_IEUNG: A = 4363
        else: return None
    else:
        return None
    return chr(((A - 0x1100) * 21 + b) * 28 + c + 0xAC00)


class BG:
    """Bipartite digraph. pos0 = received char, pos1 = word head.
    edges 0->1: char may start with head (weight 1). edges 1->0: words head->tail (weight = count)."""

    def __init__(self):
        self.nodes = [set(), set()]
        self.succ = [collections.defaultdict(dict), collections.defaultdict(dict)]
        self.pred = [collections.defaultdict(dict), collections.defaultdict(dict)]

    def add_node(self, pos, n):
        self.nodes[pos].add(n)

    def set_edge(self, pos, a, b, num=1):
        op = 1 - pos
        self.add_node(pos, a); self.add_node(op, b)
        self.succ[pos][a][b] = num
        self.pred[op][b][a] = num

    def increase(self, a, b, num):
        self.add_node(1, a); self.add_node(0, b)
        if num > 0:
            self.succ[1][a][b] = self.succ[1][a].get(b, 0) + num
            self.pred[0][b][a] = self.pred[0][b].get(a, 0) + num

    def decrease(self, a, b, num):
        v = self.succ[1][a].get(b, 0) - num
        if v <= 0:
            self.succ[1][a].pop(b, None); self.pred[0][b].pop(a, None)
        else:
            self.succ[1][a][b] = v; self.pred[0][b][a] = v

    def edge_num(self, a, b):
        return self.succ[1].get(a, {}).get(b, 0)

    def has(self, pos, n):
        return n in self.nodes[pos]

    def successors(self, pos, n):
        return list(self.succ[pos].get(n, {}).keys())

    def predecessors(self, pos, n):
        return list(self.pred[pos].get(n, {}).keys())

    def outdeg(self, pos, n):
        return len(self.succ[pos].get(n, {}))

    def indeg(self, pos, n):
        return len(self.pred[pos].get(n, {}))

    def remove_node(self, pos, n):
        op = 1 - pos
        out_e, in_e = [], []
        for s, num in list(self.succ[pos].get(n, {}).items()):
            out_e.append((n, s, num))
            self.pred[op][s].pop(n, None)
        self.succ[pos].pop(n, None)
        for p, num in list(self.pred[pos].get(n, {}).items()):
            in_e.append((p, n, num))
            self.succ[op][p].pop(n, None)
        self.pred[pos].pop(n, None)
        self.nodes[pos].discard(n)
        # edges[pos] = out edges (from pos), edges[op] = in edges (from op)
        edges = [None, None]
        edges[pos] = out_e
        edges[op] = in_e
        return edges

    def single_in_out_edges(self):
        seen = {}
        for f in self.nodes[1]:
            if self.indeg(1, f) == 1:
                seen[(f, self.predecessors(1, f)[0])] = 1
        for c in self.nodes[0]:
            if self.outdeg(0, c) == 1:
                seen[(c, self.successors(0, c)[0])] = 1
        return list(seen.keys())

    def even_loops(self):
        res = []
        for s, e in self.single_in_out_edges():
            num = self.edge_num(e, s)
            if num >= 2:
                res.append((e, s, num - num % 2))
        return res

    def two_cycles(self):
        soe = self.single_in_out_edges()
        res = []
        cnt = collections.Counter()
        for i in range(len(soe) - 1):
            h1, t1 = soe[i]
            for j in range(i + 1, len(soe)):
                h2, t2 = soe[j]
                n1 = self.edge_num(t1, h2) - cnt[(t1, h2)]
                n2 = self.edge_num(t2, h1) - cnt[(t2, h1)]
                if n1 > 0 and n2 > 0:
                    d = min(n1, n2)
                    cnt[(t1, h2)] += d; cnt[(t2, h1)] += d
                    res.append(((t1, h2), (t2, h1), d))
        return res


def build_graph(words):
    g = BG()
    cnt = collections.Counter((w[0], w[-1]) for w in words)
    for (h, t), n in cnt.items():
        g.set_edge(1, h, t, n)
    for c in list(g.nodes[0]):
        for nx in (c, sub(c)):
            if nx and g.has(1, nx):
                g.set_edge(0, c, nx)
    return g


def classify(g):
    parts = {'route': g, 'winlose': BG(), 'removed': BG()}
    route = parts['route']
    typeMap = [dict(), dict()]
    evenLoops, twoCycles, loopMap = [], [], {}

    def transfer_node(pos, n):
        edges = route.remove_node(pos, n)
        for p in (0, 1):
            for a, b, num in edges[p]:
                parts['winlose'].set_edge(p, a, b, num)

    def transfer_edge(to, a, b, num):
        route.decrease(a, b, num)
        parts[to].increase(a, b, num)

    def prune():
        tm = [dict(), dict()]
        stack = []
        el, lm = [], {}

        def seed_type(pos, name):
            if pos == 0:
                return 'lose' if route.outdeg(0, name) == 0 else 'route'
            od = route.outdeg(1, name)
            if od >= 2: return 'route'
            if od == 0: return 'lose'
            s = route.successors(1, name)[0]
            if route.outdeg(0, s) != 1 or route.successors(0, s)[0] != name:
                return 'route'
            num = route.edge_num(name, s)
            par = num % 2
            if num - par > 0:
                transfer_edge('removed', name, s, num - par)
            if num >= 2:
                el.append((name, s, num - par))
            if par == 1:
                lm[name] = s
                return 'loopwin'
            return 'lose'

        for pos in (0, 1):
            for node in list(route.nodes[pos]):
                t = seed_type(pos, node)
                if t != 'route':
                    tm[pos][node] = t
                    stack.append((pos, node))
        while stack:
            pos, name = stack.pop()
            op = 1 - pos
            preds = [p for p in route.predecessors(pos, name) if p not in tm[op]]
            typ = tm[pos][name]
            transfer_node(pos, name)
            if pos == 0:
                if typ == 'lose':
                    for p in preds:
                        tm[op][p] = 'win'; stack.append((op, p))
                else:
                    for p in preds:
                        pt = seed_type(op, p)
                        if pt != 'route':
                            tm[op][p] = pt; stack.append((op, p))
            else:
                if typ == 'lose':
                    for p in preds:
                        pt = seed_type(op, p)
                        if pt != 'route':
                            tm[op][p] = 'lose'; stack.append((op, p))
                else:
                    for p in preds:
                        tm[op][p] = typ; stack.append((op, p))
        for pos in (0, 1):
            typeMap[pos].update(tm[pos])
        evenLoops.extend(el)
        loopMap.update(lm)
        return any(len(x) for x in tm) or len(el) > 0 or len(lm) > 0

    def remove_even():
        el = route.even_loops()
        for s, e, n in el:
            transfer_edge('removed', s, e, n)
        evenLoops.extend(el)
        return len(el) > 0

    def remove_two():
        tc = route.two_cycles()
        for (a1, b1), (a2, b2), n in tc:
            transfer_edge('removed', a1, b1, n)
            transfer_edge('removed', a2, b2, n)
        twoCycles.extend(tc)
        return len(tc) > 0

    cnt = 0
    changed = True
    while cnt < 200 and changed:
        cnt += 1
        changed = False
        changed = prune() or changed
        changed = remove_even() or changed
        changed = remove_two() or changed
    return parts, typeMap, evenLoops, twoCycles, loopMap


def depth_map(graph, typeMap):
    loseSt = [[], []]; winSt = [[], []]
    outdeg = [{n: graph.outdeg(0, n) for n in graph.nodes[0]}, {n: graph.outdeg(1, n) for n in graph.nodes[1]}]
    dm = [dict(), dict()]

    def is_sink(pos, n):
        if typeMap[pos].get(n) == 'lose' and outdeg[pos].get(n) == 0:
            return 'lose'
        if pos == 1 and typeMap[pos].get(n) == 'loopwin' and outdeg[pos].get(n) == 1:
            return 'loopwin'
        return None

    for pos in (0, 1):
        for n in graph.nodes[pos]:
            t = is_sink(pos, n)
            if t == 'lose':
                loseSt[pos].append(n); dm[pos][n] = 0
            elif t == 'loopwin':
                winSt[pos].append(n); dm[pos][n] = 1
    while loseSt[1] or loseSt[0] or winSt[1] or winSt[0]:
        while loseSt[1]:
            n = loseSt[1].pop()
            for p in graph.predecessors(1, n):
                if p in dm[0]: continue
                outdeg[0][p] = outdeg[0].get(p, 0) - 1
                if is_sink(0, p):
                    loseSt[0].append(p); dm[0][p] = dm[1][n]
        while loseSt[0]:
            n = loseSt[0].pop()
            for p in graph.predecessors(0, n):
                if p in dm[1]: continue
                dm[1][p] = dm[0][n] + 1; winSt[1].append(p)
        while winSt[1]:
            n = winSt[1].pop()
            for p in graph.predecessors(1, n):
                if p in dm[0]: continue
                dm[0][p] = dm[1][n]; winSt[0].append(p)
        while winSt[0]:
            n = winSt[0].pop()
            for p in graph.predecessors(0, n):
                if p in dm[1]: continue
                outdeg[1][p] = outdeg[1].get(p, 0) - 1
                t = is_sink(1, p)
                if t == 'lose':
                    loseSt[1].append(p); dm[1][p] = dm[0][n] + 1
                elif t == 'loopwin':
                    winSt[1].append(p); dm[1][p] = dm[0][n] + 2
    return dm


def solve_words(words):
    g = build_graph(words)
    parts, typeMap, evenLoops, twoCycles, loopMap = classify(g)
    dm = depth_map(parts['winlose'], typeMap)
    return parts, typeMap, dm, evenLoops, twoCycles, loopMap
