import { connect } from '@dagger.io/dagger';
import { cwd } from 'process';
import * as path from 'path';

connect(
    async (client) => {
        const logicPath = path.join(cwd(), '..', 'logic', 'chargableCars');
        const logicSource = client
            .container()
            .from('node:18-slim')
            .withDirectory(
                'logic/chargableCars',
                client.host().directory(logicPath),
                { exclude: ['node_modules/'] }
            );

        const logicRunner = logicSource
            .withWorkdir('logic/chargableCars')
            .withExec(['npm', 'install']);

        const logicTested = logicRunner.withExec(['npm', 'test']);

        console.log(await logicTested.stderr());

        const infraPath = path.join(cwd(), '..', 'cdk');
        const infraSource = client
            .container()
            .from('node:18-slim')
            .withDirectory('cdk', client.host().directory(logicPath), {
                exclude: ['node_modules/'],
            });
    },
    { LogOutput: process.stdout }
);
