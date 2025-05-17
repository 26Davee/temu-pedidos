import express from 'express';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';

const app = express();
const prisma = new PrismaClient();

// Configura __dirname para ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Middleware
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads'))); // servir imágenes

// Multer configuración
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, path.join(__dirname, 'uploads'));
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname);
    const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    cb(null, uniqueName);
  }
});
const upload = multer({ storage });

// Ruta de prueba
app.get('/', (req, res) => {
  res.send('Servidor funcionando 🎉');
});

// POST /pedidos (sin imagen)
app.post('/pedidos', async (req, res) => {
  const { familiar, totalMonto, comentarios, articulos, fecha, estado } = req.body;

  // Validación
  if (!Array.isArray(articulos)) {
    return res.status(400).json({
      error: 'Los artículos deben ser un arreglo válido.',
      detalle: typeof articulos,
    });
  }

  // Obtener código secuencial
  const ultimo = await prisma.pedido.findFirst({
    orderBy: { id: 'desc' },
    select: { id: true }
  });
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
          create: articulos.map((a) => ({
            nombre: a.nombre,
            cantidad: a.cantidad,
            precioUnit: a.precioUnit
          }))
        }
      },
      include: { articulos: true }
    });

    res.json(pedido);
  } catch (error) {
    res.status(500).json({ error: 'Error al crear pedido', detalle: error.message });
  }
});

// ✅ POST /pedidos-con-foto (con imágenes)
app.post('/pedidos-con-foto', upload.array('imagenes'), async (req, res) => {
  try {
    const { familiar, totalMonto, fecha, estado, comentarios, articulos } = req.body;

    if (!familiar || !totalMonto || !fecha || !estado || !articulos) {
      return res.status(400).json({ error: 'Faltan campos requeridos' });
    }

    const articulosArray = JSON.parse(articulos);

    // Obtener código secuencial
    const ultimo = await prisma.pedido.findFirst({
      orderBy: { id: 'desc' },
      select: { id: true }
    });
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
          create: articulosArray.map(a => ({
            nombre: a.nombre,
            cantidad: a.cantidad,
            precioUnit: a.precioUnit
          }))
        },
        imagenes: {
          create: req.files.map(file => ({
            url: `/uploads/${file.filename}`
          }))
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

// GET /pedidos/:id
app.get('/pedidos/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const pedido = await prisma.pedido.findUnique({
      where: { id: parseInt(id) },
      include: { articulos: true, imagenes: true },
    });
    if (pedido) res.json(pedido);
    else res.status(404).json({ error: 'Pedido no encontrado' });
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener el pedido' });
  }
});

// DELETE /pedidos/:id
app.delete('/pedidos/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await prisma.articuloPedido.deleteMany({ where: { pedidoId: parseInt(id) } });
    await prisma.imagen.deleteMany({ where: { pedidoId: parseInt(id) } });
    await prisma.pedido.delete({ where: { id: parseInt(id) } });
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
      prisma.pedido.aggregate({
        _sum: { totalMonto: true },
        where: { estado: 'ENTREGADO' }
      }),
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

// Iniciar servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor escuchando en puerto ${PORT}`);
});
