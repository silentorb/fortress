module.exports = function (grunt) {

  grunt.loadNpmTasks('grunt-ts')
  grunt.loadNpmTasks('grunt-contrib-concat')
  grunt.loadNpmTasks('grunt-contrib-watch')
  grunt.loadNpmTasks('grunt-contrib-copy')
  grunt.loadNpmTasks('grunt-text-replace')

  grunt.initConfig({
    ts: {
      fortress: {                                 // a particular target
        src: ["lib/Fortress.ts"],        // The source typescript files, http://gruntjs.com/configuring-tasks#files
//        out: 'fortress.js',                // If specified, generate an out.js file which is the merged js file
        options: {                    // use to override the default options, http://gruntjs.com/configuring-tasks#options
          target: 'es5',            // 'es3' (default) | 'es5'
          module: 'commonjs',       // 'amd' (default) | 'commonjs'
          declaration: true,       // true | false  (default)
          verbose: true
        }
      }
    },
    concat: {
      options: {
        separator: ''
      },
      fortress: {
        src: [
          'lib/fortress_header.js',
          'lib/Fortress.js',
          'lib/fortress_footer.js'
        ],
        dest: 'fortress.js'
      },
      "fortress-def": {
        src: [
          'lib/Fortress.d.ts',
          'lib/fortress_definition_footer'
        ],
        dest: 'fortress.d.ts'
      }
    },
    replace: {
      "fortress-def": {
        src: ["fortress.d.ts"],
        overwrite: true,
        replacements: [
          {
            from: 'defs/',
            to: ""
          },
          {
            from: 'export = Fortress;',
            to: ""
          }
        ]
      }
    },
    copy: {
      "fortress-def": {
        files: [
          { src: 'fortress.d.ts', dest: '../../defs/'}
//          { src: 'lib/Fortress.js', dest: 'fortress.js'},
        ]
      }
    },
    watch: {
       fortress: {
        files: 'lib/Fortress.ts',
        tasks: ['default']
      }
    }
  })

  grunt.registerTask('default',
    ['ts:fortress', 'concat', 'replace', 'copy']);

}