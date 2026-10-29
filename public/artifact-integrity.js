const hash=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),value=>value.toString(16).padStart(2,'0')).join('');
export async function loadVerifiedVersion(integrity,fetchImpl=fetch){
 if(integrity?.classification!=='public_reported')throw Error('Only public versions can enter record inspection; fixture version refused');
 if(!/^[a-z0-9][a-z0-9._-]{0,127}$/i.test(integrity.artifactId)||integrity.path!==`/artifacts/${integrity.artifactId}/`||![integrity.manifestSha256,integrity.normalizedSha256].every(value=>/^[a-f0-9]{64}$/i.test(value)))throw Error('Version pin identity or path invalid');
 const read=async name=>{const response=await fetchImpl(integrity.path+name);if(!response.ok)throw Error('Selected version evidence unavailable');return new Uint8Array(await response.arrayBuffer());};
 const [manifestBytes,normalizedBytes]=await Promise.all([read('manifest.json'),read('normalized.json')]);
 if(await hash(manifestBytes)!==integrity.manifestSha256||await hash(normalizedBytes)!==integrity.normalizedSha256)throw Error('Selected version hash mismatch');
 const decode=bytes=>JSON.parse(new TextDecoder().decode(bytes)),manifest=decode(manifestBytes),artifact=decode(normalizedBytes);
 if(manifest.artifact_id!==integrity.artifactId||artifact.artifactId!==integrity.artifactId||JSON.stringify(artifact.manifest)!==JSON.stringify(manifest))throw Error('Selected version manifest identity mismatch');
 if(manifest.testFixture===true||manifest.provenance?.classification==='test_fixture'||(!integrity.defaultPinned&&manifest.provenance?.classification!=='public_reported'))throw Error('Selected version public provenance unavailable or fixture');
 return artifact;
}
export async function loadPinnedArtifact(pointer,fetchImpl=fetch){
 const read=async path=>{const response=await fetchImpl(path);if(!response.ok)throw Error('Pinned artifact evidence unavailable');return new Uint8Array(await response.arrayBuffer());};
 const decode=bytes=>JSON.parse(new TextDecoder().decode(bytes));
 const integrity=decode(await read('/artifact-integrity.json'));
 if(pointer.artifact_id!==integrity.artifactId||pointer.path!==`/artifacts/${integrity.artifactId}/`)throw Error('Pinned artifact identity mismatch');
 const [manifestBytes,normalizedBytes]=await Promise.all([read(pointer.path+'manifest.json'),read(pointer.path+'normalized.json')]);
 if(await hash(manifestBytes)!==integrity.manifestSha256||await hash(normalizedBytes)!==integrity.normalizedSha256)throw Error('Pinned artifact hash mismatch');
 const manifest=decode(manifestBytes),artifact=decode(normalizedBytes);
 if(artifact.artifactId!==integrity.artifactId||manifest.artifact_id!==integrity.artifactId||JSON.stringify(artifact.manifest)!==JSON.stringify(manifest))throw Error('Pinned artifact manifest identity mismatch');
 return artifact;
}
// Additive sidecars (e.g. Phase 2 test reports): trust runs pins → verified manifest → manifest.files[name].
// `artifact` must already come from loadVerifiedVersion/loadPinnedArtifact or a verified saved package.
export async function loadVerifiedSidecar(artifact,integrity,name,fetchImpl=fetch){
 const manifest=artifact?.manifest,files=manifest?.files;
 if(typeof name!=='string'||!/^(?:sources\/)?[a-z0-9][a-z0-9._-]{0,127}$/i.test(name)||name.split('/').includes('..'))throw Error('Sidecar name invalid');
 if(!files||typeof files!=='object'||!Object.hasOwn(files,name))throw Error(`Sidecar ${name} is not listed in the verified manifest`);
 const id=artifact.artifactId;
 if(typeof id!=='string'||integrity?.artifactId!==id||manifest.artifact_id!==id||integrity.path!==`/artifacts/${id}/`)throw Error('Sidecar version identity mismatch');
 const expected=files[name];
 if(!/^[a-f0-9]{64}$/i.test(expected?.sha256??'')||!Number.isSafeInteger(expected?.bytes)||expected.bytes<0)throw Error(`Sidecar ${name} manifest entry invalid`);
 const response=await fetchImpl(integrity.path+name);if(!response?.ok)throw Error(`Sidecar ${name} unavailable`);
 const bytes=new Uint8Array(await response.arrayBuffer());
 if(bytes.length!==expected.bytes||await hash(bytes)!==expected.sha256.toLowerCase())throw Error(`Sidecar ${name} hash or size mismatch`);
 return bytes;
}
