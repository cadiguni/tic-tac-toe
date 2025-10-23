const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    // URL do MongoDB vem da variável de ambiente ou usa local como fallback
    const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/jogo-da-velha';
    
    await mongoose.connect(mongoURI);
    console.log('✅ MongoDB conectado com sucesso');
    
    if (process.env.NODE_ENV === 'development') {
      console.log(`🔗 MongoDB URI: ${mongoURI}`);
    }
  } catch (err) {
    console.error('❌ Erro ao conectar no MongoDB:', err.message);
    process.exit(1);
  }
};

module.exports = connectDB;
// db/db.js