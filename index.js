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
