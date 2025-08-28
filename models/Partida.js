const mongoose = require('mongoose');

const partidaSchema = new mongoose.Schema({
  salaId: String,
  jogadores: [String],
  vencedor: String, // nome do vencedor ou "Empate"
  data: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Partida', partidaSchema);
// models/Partida.js