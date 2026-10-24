import {test} from 'node:test';
import assert from 'node:assert/strict';
import {deflateSync} from 'node:zlib';
import {readSourceColorMetadata, compatibleOutputColorMetadata} from '../dist/source-color-metadata.js';
const chunk=(type,payload=Buffer.alloc(0))=>{
 const body=Buffer.concat([Buffer.from(type),payload]);let crc=0xffffffff;
 for(const v of body){crc^=v;for(let bit=0;bit<8;bit++)crc=(crc>>>1)^(crc&1?0xedb88320:0);}
 const result=Buffer.alloc(payload.length+12);result.writeUInt32BE(payload.length);body.copy(result,4);result.writeUInt32BE((crc^0xffffffff)>>>0,result.length-4);return result;
};
const png=(...metadata)=>{
 const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(1);ihdr.writeUInt32BE(1,4);ihdr[8]=8;ihdr[9]=2;
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),...metadata,chunk('IDAT',deflateSync(Buffer.from([0,0,0,0]))),chunk('IEND')]);
};
test('PNG iCCP is admitted by the source MIME filter and preserved for compatible AVIF',()=>{
 const profile=new Uint8Array([0,1,2,3,4,255]);const input=png(chunk('iCCP',Buffer.concat([Buffer.from('test\0\0'),deflateSync(profile)])));
 const metadata=readSourceColorMetadata(input,'image/png');assert.deepEqual(metadata,{type:'icc',profile});assert.deepEqual(compatibleOutputColorMetadata(metadata,'image/avif'),{metadata});
});
test('PNG cICP is admitted and preserved for compatible AVIF',()=>{
 const metadata=readSourceColorMetadata(png(chunk('cICP',Buffer.from([12,13,0,1]))),'image/png');
 assert.deepEqual(metadata,{type:'cicp',cicp:{primaries:'smpte432',transfer:'iec61966-2-1',matrix:'rgb',fullRange:true}});assert.deepEqual(compatibleOutputColorMetadata(metadata,'image/avif'),{metadata});
});
test('PNG cICP takes priority over iCCP',()=>assert.equal(readSourceColorMetadata(png(chunk('iCCP',Buffer.from([0])),chunk('cICP',Buffer.from([1,13,0,1]))),'image/png').type,'cicp'));
test('source filter rejects unrelated MIME and tolerates malformed metadata',()=>{for(const mime of ['image/gif','image/svg+xml','image/png','image/jpeg','image/webp','image/avif'])assert.equal(readSourceColorMetadata(new Uint8Array(3),mime),null);});
test('Canvas conversion and explicit SDR policy retain existing metadata compatibility rules',()=>{
 const metadata={type:'icc',profile:new Uint8Array([1])};
 assert.deepEqual(compatibleOutputColorMetadata(metadata,'image/avif',{canvasColorSpace:'srgb',preserveInput:true}),{metadata:null,colorSpace:{primaries:'bt709',transfer:'iec61966-2-1'}});
 assert.deepEqual(compatibleOutputColorMetadata(metadata,'image/avif',{preserveInput:false}),{metadata:null});
 for(const mime of ['image/jpeg','image/webp'])assert.deepEqual(compatibleOutputColorMetadata(metadata,mime,{canvasColorSpace:'srgb',preserveInput:true}),{metadata:null});
});
