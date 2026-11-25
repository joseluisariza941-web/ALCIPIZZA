<?php
declare(strict_types=1);

namespace Alci\Rutas;

use Alci\Core\{Auth, Db, Fmt, HttpError, RateLimit, Request, Respuesta, Router, Sesion, V};
use Alci\Servicios\{Bitacora, Config, Horario, Puntos, Rango, Suscripcion};
use Alci\Servicios\Pedidos as P;

/** Igual que routes/pedidos.js. */
final class Pedidos
{
    private const ESTADOS = ['nuevo', 'preparando', 'listo', 'entregado', 'cancelado'];
    private const DESCUENTAN = ['preparando', 'listo', 'entregado'];

    private static function existente(int $id): array
    {
        $p = Db::uno('SELECT * FROM pedidos WHERE id = ?', [$id]);
        if (!$p) throw new HttpError(404, 'Pedido no encontrado');
        return $p;
    }

    private static function mesas(array $cfg): int
    {
        $m = P::aNumero($cfg['mesas'] ?? null);
        return $m === null ? 0 : (int) $m;
    }

    private static function limiteCliente(Request $req): void
    {
        RateLimit::exigir('tirilla-mod', max(1, (int) env('TIRILLA_MOD_MAX', '30')), 600, $req->ip, 'Demasiados intentos. Espera unos minutos.');
    }

    /** Pedido del cliente por token; 404 si el token no es válido o el pedido es del personal (sin token). */
    private static function delCliente(int $id, mixed $token): array
    {
        $fila = Db::uno('SELECT * FROM pedidos WHERE id = ?', [$id]);
        if (!$fila || !$fila['token_hash'] || !is_string($token) || $token === '' || !hash_equals((string) $fila['token_hash'], hash('sha256', $token))) {
            throw new HttpError(404, 'Pedido no encontrado');
        }
        return $fila;
    }

    /** Reemplaza los datos de un pedido "nuevo" (cliente o personal): reliquida, repone inventario y ajusta puntos. */
    private static function reeditar(Request $req, int $id, array $b, array $destino, bool $cliente, ?array $user): void
    {
        ['items' => $items, 'total' => $subtotal] = P::cotizar($b['items']);
        Db::tx(function () use ($req, $id, $b, $destino, $cliente, $user, $items, $subtotal) {
            $a = Db::uno('SELECT * FROM pedidos WHERE id = ? FOR UPDATE', [$id]);
            if (!$a || $a['estado'] !== 'nuevo') throw new HttpError(409, 'El pedido ya está en preparación y no se puede editar', 'NO_EDITABLE');
            if ($cliente && $a['pago_estado'] === 'pagado') throw new HttpError(409, 'El pedido ya está pagado y no se puede editar', 'NO_EDITABLE');
            P::devolverInventario($id);
            Puntos::devolverCanje($a);
            $celular = $b['celular'] ?? $a['celular'];
            $l = P::liquidar($items, $subtotal, $b['canjearPuntos'] ?? (int) $a['puntos_canjeados'], $celular);
            Db::actualizar('pedidos', [...$destino, 'celular' => $celular, ...P::columnasLiquidacion($l)], 'id = ?', [$id]);
            Db::ejecutar('UPDATE pedidos SET editado_en = NOW() WHERE id = ?', [$id]);
            if ($l['puntosCanjeados'] > 0) Puntos::debitar($celular, $l['puntosCanjeados'], $id);
            P::guardarItems($id, $items);
            Bitacora::registrar($req, ($cliente ? 'El cliente editó' : 'Editó') . " el pedido #$id · " . P::pesos($l['total']), $cliente ? null : $user);
        });
    }

    public static function registrar(Router $r): void
    {
        // Crear: cliente web (sin sesión) o personal (mesera / cocina).
        $r->post('/api/pedidos', function (Request $req) {
            if (!Sesion::get('userId')) {
                $max = max(1, (int) env('PEDIDOS_WEB_MAX', '10'));
                RateLimit::exigir('pedidos-web', $max, 600, $req->ip, 'Demasiados pedidos seguidos. Espera unos minutos.');
            }
            $u = Auth::cargar($req);
            if ($u) {
                Auth::revisar($req);
                if (!in_array($u['rol'], ['mesera', 'cocina'], true)) {
                    throw new HttpError(403, 'Este usuario no puede crear pedidos', 'PROHIBIDO');
                }
            }
            $staff = (bool) $u;
            $b = P::validar($req->body);
            $cfg = Config::leer();
            $metodos = Config::metodosPago();
            if (!$staff) {
                if (!Suscripcion::activa()) throw new HttpError(403, 'El servicio está en pausa. Intenta más tarde.', 'SUSPENDIDO');
                if (!Horario::estaAbierto($cfg['h'] ?? null)) {
                    throw new HttpError(403, 'Estamos cerrados en este momento. Revisa nuestros horarios.', 'CERRADO');
                }
            }
            if (!$staff && $b['destino'] === 'Domicilio' && ($cfg['domiciliosActivos'] ?? true) === false) {
                throw new HttpError(409, 'Por ahora no tenemos servicio a domicilio. Puedes recoger en el local o pedir en una mesa.', 'DOMICILIOS_APAGADOS');
            }
            $destino = P::datosDestino($b, $staff, self::mesas($cfg), $metodos);
            ['items' => $items, 'total' => $subtotal] = P::cotizar($b['items']);
            $celular = $b['celular'] ?? null;
            $l = P::liquidar($items, $subtotal, $b['canjearPuntos'] ?? 0, $celular);
            $total = $l['total'];
            $token = $staff ? null : rtrim(strtr(base64_encode(random_bytes(24)), '+/', '-_'), '=');

            $id = Db::tx(function () use ($req, $u, $staff, $destino, $items, $total, $token, $l, $celular) {
                $nuevo = Db::insertar('pedidos', [
                    'origen' => $staff ? 'mesera' : 'web', 'mesera_id' => $staff ? (int) $u['id'] : null, ...$destino,
                    'celular' => $celular, ...P::columnasLiquidacion($l), 'token_hash' => $token ? hash('sha256', $token) : null,
                ]);
                if ($l['puntosCanjeados'] > 0) Puntos::debitar($celular, $l['puntosCanjeados'], $nuevo);
                P::guardarItems($nuevo, $items);
                $txt = ($staff ? 'Creó el pedido' : 'Envió pedido') . " #$nuevo · {$destino['destino']} · " . P::pesos($total);
                Bitacora::registrar($req, $txt, $u);
                return $nuevo;
            });
            $pedido = P::cargarPedido($id);
            return Respuesta::con(201, $token ? ['pedido' => $pedido, 'token' => $token] : ['pedido' => $pedido]);
        });

        $r->get('/api/pedidos', function (Request $req) {
            Auth::rol($req, 'cocina', 'mesera');
            $f = Rango::validar($req->query);
            if (array_key_exists('estado', $req->query)) {
                $f['estado'] = V::enumeracion($req->query, 'estado', self::ESTADOS,
                    'Invalid option: expected one of ' . implode('|', array_map(fn($e) => "\"$e\"", self::ESTADOS)));
            }
            ['desde' => $desde, 'hasta' => $hasta] = Rango::rango($f, true);
            $where = 'p.creado_en >= ? AND p.creado_en < ?';
            $p = [Fmt::sql($desde), Fmt::sql($hasta)];
            if (isset($f['estado'])) { $where .= ' AND p.estado = ?'; $p[] = $f['estado']; }
            return P::cargarPedidos($where, $p);
        });

        // Tirilla del cliente (con token) o consulta del personal.
        $r->get('/api/pedidos/:id', function (Request $req, array $params) {
            RateLimit::exigir('tirilla', 240, 60, $req->ip, 'Demasiadas consultas. Espera un momento.');
            $id = P::id($params);
            $token = $req->query['token'] ?? '';
            $fila = Db::uno('SELECT id, token_hash FROM pedidos WHERE id = ?', [$id]);
            $permitido = false;
            if ($fila && $token !== '' && $fila['token_hash']) {
                $permitido = hash_equals((string) $fila['token_hash'], hash('sha256', $token));
            } elseif ($fila && $token === '') {
                $u = Auth::cargar($req);
                if ($u && in_array($u['rol'], ['cocina', 'mesera'], true)) { Auth::revisar($req); $permitido = true; }
            }
            if (!$permitido) throw new HttpError(404, 'Pedido no encontrado');
            return P::cargarPedido($id);
        });

        $r->put('/api/pedidos/:id', function (Request $req, array $params) {
            $user = Auth::rol($req, 'cocina', 'mesera');
            $id = P::id($params);
            $actual = self::existente($id);
            if ($user['rol'] === 'mesera' && (int) $actual['mesera_id'] !== (int) $user['id']) {
                throw new HttpError(403, 'Solo puedes editar tus propios pedidos', 'PROHIBIDO');
            }
            $b = P::validar($req->body);
            $destino = P::datosDestino($b, true, self::mesas(Config::leer()));
            self::reeditar($req, $id, $b, $destino, false, $user);
            return P::cargarPedido($id);
        });

        // Cotización sin guardar: mismo cálculo que el pedido (promoción y puntos).
        $r->post('/api/pedidos/cotizar', function (Request $req) {
            if (!Sesion::get('userId')) RateLimit::exigir('cotizar', 120, 60, $req->ip, 'Demasiadas consultas. Espera un momento.');
            $b = P::validar($req->body);
            ['items' => $items, 'total' => $subtotal] = P::cotizar($b['items']);
            $l = P::liquidar($items, $subtotal, $b['canjearPuntos'] ?? 0, $b['celular'] ?? null);
            return [
                'subtotal' => $l['subtotal'], 'descuentoPromo' => $l['descuentoPromo'],
                'promocion' => $l['promo'] ? ['id' => $l['promo']['id'], 'nombre' => $l['promo']['nombre']] : null,
                'puntosCanjeados' => $l['puntosCanjeados'], 'descuentoPuntos' => $l['descuentoPuntos'], 'total' => $l['total'],
            ];
        });

        // El cliente cancela su pedido con el token de la tirilla (solo mientras está "nuevo").
        $r->post('/api/pedidos/:id/cancelar', function (Request $req, array $params) {
            self::limiteCliente($req);
            $id = P::id($params);
            self::delCliente($id, $req->datos()['token'] ?? null);
            Db::tx(function () use ($req, $id) {
                $a = Db::uno('SELECT * FROM pedidos WHERE id = ? FOR UPDATE', [$id]);
                if (!$a || $a['estado'] !== 'nuevo') throw new HttpError(409, 'El pedido ya está en preparación y no se puede cancelar', 'NO_EDITABLE');
                Db::ejecutar("UPDATE pedidos SET estado = 'cancelado', cancelado_por_cliente = 1 WHERE id = ?", [$id]);
                P::devolverInventario($id);
                Puntos::alCancelar($a);
                Bitacora::registrar($req, "El cliente canceló el pedido #$id", null);
            });
            return P::cargarPedido($id);
        });

        // El cliente edita su pedido con el token de la tirilla (solo "nuevo" y sin pagar).
        $r->put('/api/pedidos/:id/cliente', function (Request $req, array $params) {
            self::limiteCliente($req);
            $id = P::id($params);
            $body = is_array($req->body) ? $req->body : [];
            self::delCliente($id, $body['token'] ?? null);
            unset($body['token']);
            $cfg = Config::leer();
            $b = P::validar($body);
            if ($b['destino'] === 'Domicilio' && ($cfg['domiciliosActivos'] ?? true) === false) {
                throw new HttpError(409, 'Por ahora no tenemos servicio a domicilio. Puedes recoger en el local o pedir en una mesa.', 'DOMICILIOS_APAGADOS');
            }
            $destino = P::datosDestino($b, false, self::mesas($cfg), Config::metodosPago());
            self::reeditar($req, $id, $b, $destino, true, null);
            return P::cargarPedido($id);
        });

        $r->patch('/api/pedidos/:id/estado', function (Request $req, array $params) {
            $user = Auth::rol($req, 'cocina', 'mesera');
            $id = P::id($params);
            $estado = V::enumeracion($req->datos(), 'estado', self::ESTADOS, 'Estado no válido');
            $actual = self::existente($id);
            if ($user['rol'] === 'mesera') {
                $entrega = $actual['estado'] === 'listo' && $estado === 'entregado';
                $cancela = $actual['estado'] === 'nuevo' && $estado === 'cancelado' && (int) $actual['mesera_id'] === (int) $user['id'];
                if (!$entrega && !$cancela) {
                    throw new HttpError(403, 'Solo puedes entregar pedidos listos o cancelar tus pedidos nuevos', 'PROHIBIDO');
                }
            }
            Db::tx(function () use ($req, $id, $estado, $actual) {
                // la condición sobre el estado anterior evita carreras (p. ej. cancelar justo cuando cocina lo toma)
                $n = Db::actualizar('pedidos', ['estado' => $estado], 'id = ? AND estado = ?', [$id, $actual['estado']]);
                if (!$n && $actual['estado'] !== $estado) throw new HttpError(409, 'El pedido cambió de estado; recarga e intenta de nuevo');
                if ($n && $estado === 'cancelado' && $actual['estado'] !== 'cancelado') Puntos::alCancelar($actual);
                if (in_array($estado, self::DESCUENTAN, true)) P::descontarInventario($id);
                Bitacora::registrar($req, "Pedido #$id: {$actual['estado']} → $estado");
            });
            return P::cargarPedido($id);
        });

        $r->post('/api/pedidos/:id/pago', function (Request $req, array $params) {
            $user = Auth::rol($req, 'cocina', 'mesera');
            $id = P::id($params);
            $d = $req->datos();
            $metodo = $d['metodoPago'] ?? null;
            if (!is_string($metodo) || mb_strlen($metodo) < 1 || mb_strlen($metodo) > 10) V::fallo('Elige el método de pago', 'metodoPago');
            $actual = self::existente($id);
            $m = Db::uno('SELECT * FROM metodos_pago WHERE codigo = ?', [$metodo]);
            if (!$m) throw new HttpError(400, 'Método de pago no válido');
            if ($actual['pago_estado'] === 'pagado') throw new HttpError(409, 'El pedido ya está pagado');
            Db::tx(function () use ($req, $id, $m, $user, $actual) {
                $n = Db::ejecutar("UPDATE pedidos SET pago_estado = 'pagado', metodo_pago = ?, pagado_en = NOW(), cobrado_por = ? WHERE id = ? AND pago_estado <> 'pagado'",
                    [$m['codigo'], (int) $user['id'], $id]);
                if (!$n) throw new HttpError(409, 'El pedido ya está pagado');
                if ($actual['estado'] !== 'cancelado') Puntos::ganar($actual);
                Bitacora::registrar($req, "Confirmó pago #$id ({$m['nombre']}) " . P::pesos($actual['total']));
            });
            return P::cargarPedido($id);
        });
    }
}
