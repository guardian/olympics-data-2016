var fs = require('fs');

var embeds = fs.readdirSync('src/renderer/templates/embeds')
    .filter(f => !(f.startsWith('_') || f.startsWith('.')))
    .map(f => f.replace('.html', ''));

module.exports = function(grunt) {

    grunt.loadNpmTasks('grunt-aws-s3');

    require('jit-grunt')(grunt);


    grunt.initConfig({

        visuals: { },

        watch: {
            data: {
                files: ['../data/data-out/**/*'],
                tasks: ['copy:data', 'shell:render'],
            },
            js: {
                files: ['src/js/**/*'],
                tasks: ['shell:interactive'],
            },
            css: {
                files: ['src/css/**/*.scss'],
                tasks: ['sass', 'shell:render'],
            },
            assets: {
                files: ['src/assets/**/*'],
                tasks: ['copy:assets']
            },
            render: {
                files: ['src/renderer/**/*'],
                tasks: ['shell:render']
            }
        },

        clean: {
            build: ['build']
        },

        sass: {
            options: {
                sourceMap: true,
                outputStyle: 'compressed'
            },
            interactive: {
                files: [
                    {'expand': true, 'cwd': 'src/css', 'src': ['*.scss', '!_*.scss'], 'ext': '.css', 'dest': 'build'}
                ]
            }
        },

        shell: {
            interactive: {
                command: './node_modules/.bin/jspm bundle-sfx <%= visuals.jspmFlags %> src/js/main build/main.js',
                options: {
                    execOptions: {
                        cwd: '.'
                    }
                }
            },
            render: {
                command: './node_modules/.bin/babel-node src/renderer/render.js',
                options: {
                    execOptions: {
                        cwd: '.'
                    }
                }
            }
        },

        copy: {
            data: {
                files: [
                    {expand: true, cwd: '../data/data-out', src: ['*.json'], dest: 'build/data'},
                ]
            },
            assets: {
                files: [
                    {expand: true, cwd: 'src/', src: ['assets/**/*'], dest: 'build'},
                ]
            }
        },
        aws_s3: {
            options: {
                region: 'us-east-1',
                awsProfile: 'visuals',
                debug: grunt.option('dry'),
                bucket: '<%= visuals.s3.bucket %>',
                uploadConcurrency: 10,
                downloadConcurrency: 10
            },
            production: {
                options: {
                },
                files: [
                    { // EMBED
                        expand: true,
                        cwd: 'build',
                        src: [
                            'main.html', 'main.css', 'main.js', 'main.js.map',
                            '*.json', 'embed/*.html',
                            'data/*.json'
                        ],
                        dest: '<%= visuals.s3.path %>/booted',
                        params: { CacheControl: 'max-age=30' }
                    }
                ]
            }
        },

        connect: {
            server: {
                options: {
                    hostname: '0.0.0.0',
                    port: 8000,
                    base: 'build',
                    middleware: function (connect, options, middlewares) {
                        // inject a custom middleware http://stackoverflow.com/a/24508523
                        middlewares.unshift(function (req, res, next) {
                            res.setHeader('Access-Control-Allow-Origin', '*');
                            res.setHeader('Access-Control-Allow-Methods', '*');
                            return next();
                        });
                        return middlewares;
                    }
                }
            }
        }
    });

    grunt.registerTask('loadDeployConfig', function() {
        grunt.config('visuals', {
            s3: grunt.file.readJSON('./cfg/s3.json'),
            timestamp: Date.now(),
            jspmFlags: '-m',
            assetPath: '<%= visuals.s3.domain %><%= visuals.s3.path %>/<%= visuals.timestamp %>'
        });
    })

    grunt.registerTask('boot_url', function() {
        grunt.log.write('\nMAIN URL: '['green'].bold)
        grunt.log.writeln(grunt.template.process('<%= visuals.s3.domain %><%= visuals.s3.path %>/booted/main.html'))

        var baseUrl = 'http://gu.com/'; // TODO

        embeds.forEach(embed => {
            grunt.log.writeln(`\n${embed}: `['green'].bold);

            var snapUri = grunt.template.process(`<%= visuals.s3.domain %><%= visuals.s3.path %>/booted/${embed}.json`);
            var params = [
                ['gu-snapType', 'json.html'],
                ['gu-snapUri', snapUri]
            ];
            grunt.log.writeln(baseUrl + '?' + params.map(p => `${p[0]}=${encodeURIComponent(p[1])}`).join('&'));

            var embedUri = grunt.template.process(`<%= visuals.s3.domain %><%= visuals.s3.path %>/booted/embed/${embed}.html`);
            grunt.log.writeln(embedUri);
        });
    })

    grunt.registerTask('build', ['sass', 'shell:interactive', 'shell:render', 'copy:assets']);
    grunt.registerTask('deploy', ['loadDeployConfig', 'copy', 'build', 'aws_s3', 'boot_url']);

    grunt.registerTask('default', ['clean', 'build', 'copy:data', 'connect', 'watch']);

    grunt.registerTask('urls', ['loadDeployConfig', 'boot_url']);

    grunt.loadNpmTasks('grunt-aws');

}
