import * as zmq from 'zeromq';
import { Start, Conflict, Success } from '../../types/vscle/analyzer';
const sock = new zmq.Reply;

function timeout(ms: number) {
    return new Promise(resolve => {
        setTimeout(resolve, ms);
    });
}

async function start() {
    console.log('Starting ZMQ test server on tcp://*:5555');
    await sock.bind('tcp://*:5555');

    for await (const [msg] of sock) {
        const signal: Start = JSON.parse(msg.toString());

        console.log('Received start signal: ');
        console.log(signal);

        console.log('\nWaiting for 2000ms');
        await timeout(2000);
        const conflict: Conflict = {
            name: 'Unresolvable Data Conflict',
            description: 'Purple is not shareable with orange',
            sources: [{
                file: signal.filenames[0],
                line: 42
            }],
            remedies: []
        };
        const success: Success = { result: 'Success' };
        const responses = [success, { result: 'Conflict', conflicts: [conflict] }];
        const rand = Math.floor(Math.random() * responses.length);
        console.log('Sending random response:');
        console.log(responses[rand]);
        await sock.send(JSON.stringify(responses[rand]));
    }
}

start();