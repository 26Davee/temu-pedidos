import express from 'express';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';

const app = express();
const prisma = new PrismaClient();

app.use(cors());
app.use(express.json());

// Ruta de prueba
app.get('/', (req, res) => {
  res.send('Servidor funcionando 🎉');
});

// ✅ POST /pedidos con validación segura
app.post('/pedidos', async (req, res) => {
  const { familiar, totalMonto, comentarios, articulos } = req.body;

  // Validación: articulos debe ser un array
  if (!Array.isArray(articulos)) {
    return res.status(400).json({
      error: 'Los artículos deben ser un arreglo válido.',
      detalle: typeof articulos,
    });
  }

  try {
    const pedido = await prisma.pedido.create({
      data: {
        familiar,
        totalMonto,
        comentarios,
        articulos: {
          create: articulos.map((a) => ({
            nombre: a.nombre,
            cantidad: a.cantidad,
            precioUnit: a.precioUnit,
          })),
        },
      },
      include: { articulos: true },
    });

    res.json(pedido);
  } catch (error) {
    res.status(500).json({
      error: 'Error al crear pedido',
      detalle: error.message,
    });
  }
});

// GET /pedidos
app.get('/pedidos', async (req, res) => {
  try {
    const pedidos = await prisma.pedido.findMany({
      include: { articulos: true },
      orderBy: { fecha: 'desc' },
    });
    res.json(pedidos);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener pedidos' });
  }
});

// GET /pedidos/:id
app.get('/pedidos/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const pedido = await prisma.pedido.findUnique({
      where: { id: parseInt(id) },
      include: { articulos: true },
    });

    if (pedido) res.json(pedido);
    else res.status(404).json({ error: 'Pedido no encontrado' });
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener el pedido' });
  }
});

// Iniciar servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor escuchando en puerto ${PORT}`);
});

// DELETE /pedidos/:id
app.delete('/pedidos/:id', async (req, res) => {
  const { id } = req.params;

  try {
    await prisma.articuloPedido.deleteMany({ where: { pedidoId: parseInt(id) } }); // primero borra artículos
    await prisma.pedido.delete({ where: { id: parseInt(id) } }); // luego borra el pedido

    res.json({ mensaje: 'Pedido eliminado correctamente' });
  } catch (error) {
    res.status(500).json({ error: 'Error al eliminar el pedido', detalle: error.message });
  }
});

app.get('/estadisticas', async (req, res) => {
  try {
    const [porMes, entregados, porEstado, pedidos] = await Promise.all([
      prisma.pedido.groupBy({
        by: ['fecha'],
        _count: true
      }),

      prisma.pedido.aggregate({
        _sum: {
          totalMonto: true
        },
        where: {
          estado: 'ENTREGADO'
        }
      }),

      prisma.pedido.groupBy({
        by: ['estado'],
        _count: true
      }),

      prisma.pedido.findMany({
        select: {
          familiar: true,
          totalMonto: true
        }
      })
    ]);

    // Agrupar pedidos por año-mes (ej. 2025-05)
    const totalPorMes = {};
    porMes.forEach(({ fecha, _count }) => {
      const key = fecha.toISOString().slice(0, 7);
      totalPorMes[key] = (totalPorMes[key] || 0) + _count;
    });

    // Agrupar por estado
    const porEstadoObj = {};
    porEstado.forEach(({ estado, _count }) => {
      porEstadoObj[estado] = _count;
    });

    // Agrupar por persona
    const porPersona = {};
    pedidos.forEach(({ familiar, totalMonto }) => {
      porPersona[familiar] = (porPersona[familiar] || 0) + totalMonto;
    });

    res.json({
      totalPorMes,
      montoEntregado: entregados._sum.totalMonto || 0,
      porEstado: porEstadoObj,
      porPersona
    });
  } catch (error) {
    console.error("Error en /estadisticas:", error);
    res.status(500).json({ error: "Error al obtener estadísticas" });
  }
});


// PUT /pedidos/:id/estado
app.put('/pedidos/:id/estado', async (req, res) => {
  const { id } = req.params;
  const { estado } = req.body;

  try {
    const pedidoActualizado = await prisma.pedido.update({
      where: { id: parseInt(id) },
      data: { estado }
    });

    res.json(pedidoActualizado);
  } catch (error) {
    console.error('Error al actualizar estado:', error);
    res.status(500).json({ error: 'Error al actualizar el estado del pedido' });
  }
});
