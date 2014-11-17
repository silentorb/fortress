module.exports = function (grunt) {

  grunt.loadNpmTasks('grunt-ts')
  grunt.loadNpmTasks('grunt-contrib-concat')
  grunt.loadNpmTasks('grunt-contrib-watch')
  grunt.loadNpmTasks('grunt-text-replace')

  grunt.initConfig({
    ts: {
      fortress: {                                 // a particular target
        src: ["lib/export.ts"],        // The source typescript files, http://gruntjs.com/configuring-tasks#files
        out: 'fortress.js',                // If specified, generate an out.js file which is the merged js file
        options: {                    // use to override the default options, http://gruntjs.com/configuring-tasks#options
          target: 'es5',            // 'es3' (default) | 'es5'
          module: 'commonjs',       // 'amd' (default) | 'commonjs'
          sourcemap: false,          // true  (default) | false
          declaration: false,       // true | false  (default)
          verbose: true,
          removeComments: false
        }
      }
    },
    watch: {
       fortress: {
        files: '**/*.ts',
        tasks: ['default']
      }
    },
    replace: {
      "server": {
        src: 'fortress.js',
        overwrite: true,
        replacements: [
          {
            from: '///***',
            to: ""
          }
        ]
      }
    }
  })

  grunt.registerTask('default',
    ['ts:fortress', 'replace']);

}