const mongoose = require('mongoose');

const partidaSchema = new mongoose.Schema({
  salaId: String,
  modo: { type: String, default: 'classico' }, // 'classico' | 'infinito'
  jogadores: [String],
  vencedor: String, // nome do vencedor ou "Empate"
  dataPartida: { type: Date, default: Date.now },
  duracao: Number, // duração em segundos
  totalJogadas: Number
}, {
  timestamps: true // adiciona createdAt e updatedAt automaticamente
});

// O ranking agrupa por vencedor e as estatísticas filtram por data e modo.
partidaSchema.index({ vencedor: 1 });
partidaSchema.index({ dataPartida: -1 });
partidaSchema.index({ modo: 1 });

module.exports = mongoose.model('Partida', partidaSchema);
