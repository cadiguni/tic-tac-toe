const mongoose = require('mongoose');

const partidaSchema = new mongoose.Schema({
  salaId: String,
  jogadores: [String],
  vencedor: String, // nome do vencedor ou "Empate"
  dataPartida: { type: Date, default: Date.now },
  duracao: Number, // duração em segundos
  totalJogadas: Number
}, {
  timestamps: true // adiciona createdAt e updatedAt automaticamente
});

module.exports = mongoose.model('Partida', partidaSchema);
// models/Partida.js