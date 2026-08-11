/**
 * `strict` is the important setting here. Without it an undefined or pending step is
 * reported as a warning and the run still exits zero, so a feature file describing
 * behaviour nobody has implemented reads as a pass. With it, an unbound step fails.
 */
module.exports = {
  default: {
    import: ['support/**/*.ts', 'steps/**/*.ts'],
    paths: ['features/**/*.feature'],
    format: ['progress-bar'],
    formatOptions: { snippetInterface: 'async-await' },
    strict: true,
  },
}
