import { connect } from '@dagger.io/dagger';
import { cwd, env } from 'process';
import * as path from 'path';

connect(
    async (client) => {
        console.log('Initialize container for interacting with logic.');
        const logicPath = path.join(cwd(), '..', 'logic', 'chargableCars');
        const logicDir = client.host().directory(logicPath);
        const logicSource = client
            .container()
            .from('node:18-slim')
            .withDirectory('logic/chargableCars', logicDir, {
                exclude: ['node_modules/'],
            });

        console.log('Install dependencies for logic.');
        const logicRunner = logicSource
            .withWorkdir('logic/chargableCars')
            .withExec(['npm', 'ci']);

        console.log('Execute unit tests on logic.');
        const logicTested = logicRunner.withExec(['npm', 'test']);
        await logicTested.stderr();

        console.log('Package logic');
        const buildDir = logicRunner
            .withExec(['npx', 'esbuild', 'lib/index.ts',
                '--bundle',
                '--minify',
                '--platform=node',
                '--target=es2020',
                '--outfile=dist/index.js'
            ]).directory('./dist');

        console.log('Initilize container for interacting with infra.');
        const infraPath = path.join(cwd(), '..', 'cdk');
        const infraSource = client
            .container()
            .from('node:18-slim')
            .withDirectory('cdk', client.host().directory(infraPath), {
                exclude: ['node_modules/'],
            })
            .withDirectory(
                'logic/chargableCars/dist',
                buildDir,
            );

        console.log('Install dependencies for infra.');
        const infraRunner = infraSource
            .withWorkdir('cdk')
            .withExec(['npm', 'ci']);

        console.log('Execute unit tests on infra.');
        const infraTested = infraRunner.withExec(['npm', 'test']);
        await infraTested.stderr();

        console.log('Creds');
        console.log(env.GREENMO_AWS_REGION);

        console.log('Deploy infra.');
        const infraDeployed = infraTested
            .withEnvVariable('AWS_ACCOUNT', env.GREENMO_AWS_ACCOUNT || 'undefined')
            .withEnvVariable('AWS_REGION', env.GREENMO_AWS_REGION || 'undefined')
            .withEnvVariable(
                'AWS_ACCESS_KEY_ID',
                env.GREENMO_AWS_ACCESS_KEY_ID || 'undefined'
            )
            .withEnvVariable(
                'AWS_SECRET_ACCESS_KEY',
                env.GREENMO_AWS_SECRET_ACCESS_KEY || 'undefined'
            )
            .withEnvVariable(
                'OPEN_MAPS_API_TOKEN',
                env.GREENMO_OPEN_MAPS_API_TOKEN || 'undefined'
            )
            .withExec(['npx', 'cdk', 'deploy']);

        await infraDeployed.stderr();
    },
    { LogOutput: process.stdout }
);
