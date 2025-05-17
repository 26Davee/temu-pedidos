// index.js completo y listo para Railway con Cloudinary

import express from 'express';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import { v2 as cloudinary } from 'cloudinary';
import { CloudinaryStorage } from 'multer-storage-cloudinary';
import dotenv from 'dotenv';

const app = express();
const prisma = new PrismaClient();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Configurar almacenamiento con Cloudinary
const storage = new CloudinaryStorage({
  cloudinary,
  params: async () => ({
    folder: 'temu-pedidos',
    resource_type: 'image'
  })
});

const upload = multer({ storage });

// Middleware
app.use(express.json());
app.use(cors({
  origin: 'https://temu-frontend.vercel.app',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true
}));

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});


// Ruta de prueba
app.get('/', (req, res) => {
  res.send('Servidor funcionando 🎉');
});

// POST /pedidos (sin imagen)
app.post('/pedidos', async (req, res) => {
  const { familiar, totalMonto, comentarios, articulos, fecha, estado } = req.body;

  const parsedArticulos = typeof articulos === 'string' ? JSON.parse(articulos) : articulos;
if (!Array.isArray(parsedArticulos)) {
  return res.status(400).json({ error: 'Los artículos deben ser un arreglo válido.', detalle: articulos });
}


  const ultimo = await prisma.pedido.findFirst({ orderBy: { id: 'desc' }, select: { id: true } });
  const nuevoCodigo = `Dx${String((ultimo?.id || 0) + 1).padStart(4, '0')}`;

  try {
    const pedido = await prisma.pedido.create({
      data: {
        familiar,
        totalMonto,
        comentarios,
        fecha: fecha ? new Date(fecha) : new Date(),
        estado: estado || 'PENDIENTE',
        codigo: nuevoCodigo,
        articulos: {
          create: articulos.map((a) => ({ nombre: a.nombre, cantidad: a.cantidad, precioUnit: a.precioUnit }))
        }
      },
      include: { articulos: true }
    });

    res.json(pedido);
  } catch (error) {
    res.status(500).json({ error: 'Error al crear pedido', detalle: error.message });
  }
});

// POST /pedidos-con-foto (con imagenes en Cloudinary)
app.post('/pedidos-con-foto', upload.array('imagenes'), async (req, res) => {
  try {
    const { familiar, totalMonto, fecha, estado, comentarios, articulos } = req.body;

    if (!familiar || !totalMonto || !fecha || !estado || !articulos) {
      return res.status(400).json({ error: 'Faltan campos requeridos' });
    }

    const articulosArray = JSON.parse(articulos);

    const ultimo = await prisma.pedido.findFirst({ orderBy: { id: 'desc' }, select: { id: true } });
    const nuevoCodigo = `Dx${String((ultimo?.id || 0) + 1).padStart(4, '0')}`;

    const pedido = await prisma.pedido.create({
      data: {
        familiar,
        totalMonto: parseFloat(totalMonto),
        fecha: new Date(fecha),
        estado,
        codigo: nuevoCodigo,
        comentarios,
        articulos: {
          create: articulosArray.map(a => ({ nombre: a.nombre, cantidad: a.cantidad, precioUnit: a.precioUnit }))
        },
        
        imagenes: {
          create: req.files.map(file => ({ url: file.path || file.secure_url }))
        }

      },
      include: { articulos: true, imagenes: true }
    });

    res.json(pedido);
  } catch (error) {
    console.error('Error al crear pedido con foto:', error);
    res.status(500).json({ error: 'Error al procesar el pedido con imagen', detalle: error.message });
  }
});

// GET /pedidos
app.get('/pedidos', async (req, res) => {
  try {
    const pedidos = await prisma.pedido.findMany({
      include: { articulos: true, imagenes: true },
      orderBy: { fecha: 'desc' },
    });
    res.json(pedidos);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener pedidos' });
  }
});

// DELETE /pedidos/:id
app.delete('/pedidos/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await prisma.articuloPedido.deleteMany({
      where: { pedidoId: parseInt(id) }
    });

    await prisma.imagenPedido.deleteMany({
      where: { pedidoId: parseInt(id) }
    });

    await prisma.pedido.delete({
      where: { id: parseInt(id) }
    });

    res.json({ mensaje: 'Pedido eliminado correctamente' });
  } catch (error) {
    res.status(500).json({ error: 'Error al eliminar el pedido', detalle: error.message });
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
    res.status(500).json({ error: 'Error al actualizar el estado del pedido' });
  }
});

// GET /estadisticas
app.get('/estadisticas', async (req, res) => {
  try {
    const [porMes, entregados, porEstado, pedidos] = await Promise.all([
      prisma.pedido.groupBy({ by: ['fecha'], _count: true }),
      prisma.pedido.aggregate({ _sum: { totalMonto: true }, where: { estado: 'ENTREGADO' } }),
      prisma.pedido.groupBy({ by: ['estado'], _count: true }),
      prisma.pedido.findMany({ select: { familiar: true, totalMonto: true } })
    ]);

    const totalPorMes = {};
    porMes.forEach(({ fecha, _count }) => {
      const key = fecha.toISOString().slice(0, 7);
      totalPorMes[key] = (totalPorMes[key] || 0) + _count;
    });

    const porEstadoObj = {};
    porEstado.forEach(({ estado, _count }) => {
      porEstadoObj[estado] = _count;
    });

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
    res.status(500).json({ error: 'Error al obtener estadísticas' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor escuchando en puerto ${PORT}`);
});
