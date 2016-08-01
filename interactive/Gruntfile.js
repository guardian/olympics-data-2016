var fs = require('fs');

var embeds = fs.readdirSync('src/renderer/templates/embeds')
    .filter(f => !(f.startsWith('_') || f.startsWith('.')))
    .map(f => f.replace('.html', ''));

module.exports = function(grunt) {

    grunt.loadNpmTasks('grunt-aws-s3');

    require('jit-grunt')(grunt);


    grunt.initConfig({
        visuals: {'s3': grunt.file.readJSON('./cfg/s3.json')},

        dataCfg: grunt.file.readJSON('../data/config.json'),

        watch: {
            data: {
                files: ['../data/data-out/**/*', 'src/**'],
                tasks: ['shell:render'],
            },
            js: {
                files: ['src/js/**/*'],
                tasks: ['jspm'],
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
            },
            server: {
                files: ['../data/data-out/**/*'],
                tasks: ['deploy'],
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
            render: {
                command: './node_modules/.bin/babel-node src/renderer/render.js',
                options: {
                    execOptions: {
                        cwd: '.'
                    }
                }
            }
        },

        jspm: {
            options: {
                sfx: true,
                minify: true,
                mangle: true
            },
            interactive: {
                files: [
                    {expand: true, cwd: 'src/js', 'src': ['*.js', '!config.js'], 'dest': 'build'}
                ]
            }
        },

        copy: {
            assets: {
                files: [
                    {expand: true, cwd: 'src/', src: ['assets/**/*'], dest: 'build'},
                ]
            }
        },
        aws_s3: {
            options: {
                region: 'us-east-1',
                accessKeyId: '<%= dataCfg.aws.auth.accessKeyId %>',
                secretAccessKey: '<%= dataCfg.aws.auth.secretAccessKey %>',
                debug: grunt.option('dry'),
                bucket: '<%= visuals.s3.bucket %>',
                uploadConcurrency: 10,
                downloadConcurrency: 10,
                differential: true,
                displayChangesOnly: true
            },
            production: {
                options: {
                },
                files: [
                    {
                        expand: true,
                        cwd: 'build',
                        src: [
                            '*.html', '*.css', '*.js', '*.js.map',
                            '*.json', 'days/*.html', 'days/*.json', 'embed/*.html',
                            'medals/countries/*.html',
                            'assets/**/*', '!assets/imgs/flags/*'
                        ],
                        dest: '<%= visuals.s3.path %>/' + process.env.USER,
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

    grunt.registerTask('urls', function() {
        var path = grunt.template.process('<%= visuals.s3.domain %><%= visuals.s3.path %>/') + process.env.USER;
        grunt.log.writeln('\nMain URLs: '['green'].bold);
        ['schedule.js', 'medals.js'].forEach(t => grunt.log.writeln(`${path}/${t}`));

        var baseUrl = 'http://gu.com/'; // TODO

        embeds.forEach(embed => {
            grunt.log.writeln(`\n${embed}: `['green'].bold);

            var snapUri = `${path}/${embed}.json`;
            var params = [
                ['gu-snapType', 'json.html'],
                ['gu-snapUri', snapUri]
            ];
            grunt.log.writeln(baseUrl + '?' + params.map(p => `${p[0]}=${encodeURIComponent(p[1])}`).join('&'));

            var embedUri = `${path}/embed/${embed}.html`;
            grunt.log.writeln(embedUri);
        });
    })

    grunt.registerTask('watch:basic', function () {
        delete grunt.config.data.watch.server;
        grunt.task.run('watch');
    });

    grunt.registerTask('build', ['clean', 'sass', 'jspm', 'shell:render', 'copy']);
    grunt.registerTask('deploy', ['build', 'aws_s3', 'urls']);
    grunt.registerTask('default', ['build', 'connect', 'watch:basic']);

    grunt.registerTask('server', ['deploy', 'watch:server']);
}
