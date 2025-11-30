from flask import Flask, jsonify, request, send_from_directory
import heapq

app = Flask(__name__, static_folder=".", static_url_path="")

# --- Definim nodurile (doar pentru referință pe front-end) ---
NODES = ["A", "B", "C", "D", "E", "F"]

# --- Definim graful rutier cu "tensiune coezivă" pe segmente ---

# Fiecare muchie: lungime (km), viteză (km/h), tensiune [0..1], trafic (factor)
EDGES = [
    {
        "id": "A-B",
        "from": "A",
        "to": "B",
        "length_km": 2.0,
        "speed_kmh": 50,
        "tension": 0.2,      # segment relativ stabil
        "traffic": 1.0
    },
    {
        "id": "B-C",
        "from": "B",
        "to": "C",
        "length_km": 1.5,
        "speed_kmh": 40,
        "tension": 0.8,      # intersecție dificilă, aglomerată
        "traffic": 1.3
    },
    {
        "id": "A-D",
        "from": "A",
        "to": "D",
        "length_km": 3.0,
        "speed_kmh": 60,
        "tension": 0.1,      # drum de centură, mai stabil
        "traffic": 1.0
    },
    {
        "id": "D-E",
        "from": "D",
        "to": "E",
        "length_km": 1.8,
        "speed_kmh": 50,
        "tension": 0.3,
        "traffic": 1.0
    },
    {
        "id": "E-C",
        "from": "E",
        "to": "C",
        "length_km": 2.2,
        "speed_kmh": 50,
        "tension": 0.2,
        "traffic": 1.0
    },
    {
        "id": "C-F",
        "from": "C",
        "to": "F",
        "length_km": 2.5,
        "speed_kmh": 50,
        "tension": 0.4,
        "traffic": 1.0
    },
    {
        "id": "E-F",
        "from": "E",
        "to": "F",
        "length_km": 2.0,
        "speed_kmh": 60,
        "tension": 0.15,
        "traffic": 1.0
    }
]

# Construim o listă de adiacență pentru rutare în ambele sensuri.
ADJ = {node: [] for node in NODES}
for edge in EDGES:
    # muchie dus
    ADJ[edge["from"]].append(edge)
    # muchie întors (simetrică)
    rev = edge.copy()
    rev["id"] = edge["id"] + "_rev"
    rev["from"], rev["to"] = edge["to"], edge["from"]
    ADJ[rev["from"]].append(rev)


def edge_cost(edge, alpha, beta):
    """
    Costul coeziv al unei muchii:
    - componentă de timp
    - componentă de tensiune structurală
    """
    # timp în minute
    effective_speed = edge["speed_kmh"] / edge["traffic"]
    time_min = 60.0 * edge["length_km"] / max(effective_speed, 1.0)
    tension = edge["tension"]

    # cost combinat
    return alpha * time_min + beta * tension


def compute_route(src, dst, alpha=1.0, beta=2.0):
    """
    Dijkstra simplu cu cost = timp + tensiune.
    alpha = pondere timp
    beta  = pondere tensiune
    """
    if src not in NODES or dst not in NODES:
        return None

    dist = {node: float("inf") for node in NODES}
    prev = {node: None for node in NODES}
    dist[src] = 0.0

    heap = [(0.0, src)]

    while heap:
        cost_u, u = heapq.heappop(heap)
        if cost_u > dist[u]:
            continue
        if u == dst:
            break
        for edge in ADJ[u]:
            v = edge["to"]
            c = edge_cost(edge, alpha, beta)
            new_cost = cost_u + c
            if new_cost < dist[v]:
                dist[v] = new_cost
                # salvăm și id-ul muchiei pentru reconstrucția traseului
                prev[v] = (u, edge["id"])
                heapq.heappush(heap, (new_cost, v))

    if dist[dst] == float("inf"):
        return None

    # Reconstruim ruta
    path_nodes = []
    path_edges = []
    cur = dst
    total_time = 0.0
    total_tension = 0.0

    while cur is not None:
        path_nodes.append(cur)
        prev_entry = prev[cur]
        if prev_entry is not None:
            u, edge_id = prev_entry
            path_edges.append(edge_id)
            # găsim muchia originală (sau rev)
            e = next(e for e in ADJ[u] if e["id"] == edge_id)
            effective_speed = e["speed_kmh"] / e["traffic"]
            time_min = 60.0 * e["length_km"] / max(effective_speed, 1.0)
            total_time += time_min
            total_tension += e["tension"]
            cur = u
        else:
            break

    path_nodes.reverse()
    path_edges.reverse()

    avg_tension = total_tension / max(len(path_edges), 1)

    return {
        "nodes": path_nodes,
        "edges": path_edges,
        "total_time_min": total_time,
        "avg_tension": avg_tension,
        "total_cost": dist[dst]
    }


@app.route("/")
def index():
    return send_from_directory(".", "index.html")


@app.route("/api/graph")
def api_graph():
    """Returnăm harta pentru front-end (noduri + muchii)."""
    return jsonify({
        "nodes": NODES,
        "edges": EDGES
    })


@app.route("/api/route")
def api_route():
    src = request.args.get("src", "A")
    dst = request.args.get("dst", "F")
    try:
        alpha = float(request.args.get("alpha", "1.0"))
        beta = float(request.args.get("beta", "2.0"))
    except ValueError:
        alpha, beta = 1.0, 2.0

    result = compute_route(src, dst, alpha, beta)
    if result is None:
        return jsonify({"error": "Nu există rută"}), 400

    return jsonify(result)


if __name__ == "__main__":
    # rulează serverul de demo
    app.run(debug=True)
