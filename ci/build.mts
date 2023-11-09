import { connect } from '@dagger.io/dagger';
import { cwd, env } from 'process';
import * as path from 'path';

connect(
    async (client) => {
        console.log('Initialize container for interacting with logic.');
        const logicPath = path.join(cwd(), '..', 'logic', 'chargableCars');
        const logicSource = client
            .container()
            .from('node:18-slim')
            .withDirectory(
                'logic/chargableCars',
                client.host().directory(logicPath),
                { exclude: ['node_modules/'] }
            );

        console.log('Install dependencies for logic.');
        const logicRunner = logicSource
            .withWorkdir('logic/chargableCars')
            .withExec(['npm', 'ci']);

        console.log('Execute unit tests on logic.');
        const logicTested = logicRunner.withExec(['npm', 'test']);

        console.log(await logicTested.stderr());

        console.log('Initilize container for interacting with infra.');
        const infraPath = path.join(cwd(), '..', 'cdk');
        const infraSource = client
            .container()
            .from('node:18-slim')
            .withDirectory('cdk', client.host().directory(infraPath), {
                exclude: ['node_modules/'],
            })
            .withDirectory(
                'logic/chargableCars',
                client.host().directory(logicPath),
                {
                    exclude: ['node_modules/'],
                }
            );

        console.log('Install dependencies for infra.');
        const infraRunner = infraSource
            .withWorkdir('cdk')
            .withExec(['npm', 'ci']);

        console.log('Execute unit tests on infra.');
        const infraTested = infraRunner.withExec(['npm', 'test']);

        await infraTested.stderr();

        console.log('Deploy infra.');
        const infraDeployed = infraRunner
            .withEnvVariable('AWS_ACCOUNT', env['AWS_ACCOUNT'] || 'undefined')
            .withEnvVariable('AWS_REGION', env['AWS_REGION'] || 'undefined')
            .withEnvVariable(
                'AWS_ACCESS_KEY_ID',
                env['AWS_ACCESS_KEY_ID'] || 'undefined'
            )
            .withEnvVariable(
                'AWS_SECRET_ACCESS_KEY',
                env['AWS_SECRET_ACCESS_KEY'] || 'undefined'
            )
            .withEnvVariable(
                'OPEN_MAPS_API_TOKEN',
                env['OPEN_MAPS_API_TOKEN'] || 'undefined'
            )
            .withExec(['npx', 'cdk', 'deploy']);

        await infraDeployed.stderr();
    },
    { LogOutput: process.stdout }
);
