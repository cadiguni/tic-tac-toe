const mongoose = require('mongoose');

const partidaSchema = new mongoose.Schema({
  salaId: String,
  modo: { type: String, default: 'classico' }, // 'classico' | 'infinito'

  // Nomes exibidos na partida (contas e convidados), mantidos para histórico
  jogadores: [String],
  vencedor: String, // nome do vencedor ou "Empate"

  // Identidade de conta. Fica null quando o jogador era convidado — e é isso
  // que mantém convidados fora do ranking. Partidas gravadas antes da
  // autenticação existir também têm null aqui e, por consequência, saem do
  // ranking sem precisar de migração.
  vencedorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', default: null },
  jogadoresIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Usuario' }],

  dataPartida: { type: Date, default: Date.now },
  duracao: Number, // duração em segundos
  totalJogadas: Number
}, {
  timestamps: true // adiciona createdAt e updatedAt automaticamente
});

// O ranking agrupa por vencedorId; as estatísticas filtram por data e modo.
partidaSchema.index({ vencedorId: 1 });
partidaSchema.index({ dataPartida: -1 });
partidaSchema.index({ modo: 1 });

module.exports = mongoose.model('Partida', partidaSchema);
