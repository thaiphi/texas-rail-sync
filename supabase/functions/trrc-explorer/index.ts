import {createHostedEdgeHandler} from '../../../src/hosted/edge-bootstrap.mjs';

// Public reads are intentional; the bootstrap authenticates collection routes
// itself and keeps them unavailable until a separate hosted-write contract exists.
const handler=createHostedEdgeHandler({getEnv:(name:string)=>Deno.env.get(name)});
Deno.serve(handler);
