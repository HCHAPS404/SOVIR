#!/usr/bin/env python3
"""Exercise a RUNNING SOVIR local API. Does not launch cargo; sends synthetic metadata only."""
import os
import json
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone, timedelta
from uuid import uuid4
URL='http://127.0.0.1:8787'
TOKEN=os.environ.get('SOVIR_API_DEV_TOKEN','')
if len(TOKEN)<24: sys.exit('Set SOVIR_API_DEV_TOKEN (>= 24 chars); do not commit it.')
now=int(datetime.now(timezone.utc).timestamp()*1000)
def post(path,obj):
    req=urllib.request.Request(URL+path, json.dumps(obj).encode(),
        {'content-type':'application/json','authorization':'Bearer '+TOKEN},method='POST')
    try:
        with urllib.request.urlopen(req,timeout=5) as response:
            data=response.read()
            print(path,'HTTP',response.status, data.decode() if data else '')
            return response.status
    except urllib.error.HTTPError as e:
        print(path,'HTTP',e.code,e.read().decode());return e.code

grant_id='test-'+uuid4().hex
source='browser.synthetic'
assert post('/v1/consents',{'grant_id':grant_id,'source_id':source,'expires_at_ms':now+3600000})==201
event={'event_id':'test-'+uuid4().hex,'source_id':source,'observed_at_ms':now,
 'modality':'URL','content_digest':'sha256:synthetic-digest-only','consent_grant_id':grant_id,
 'sensitive_data_class':'PUBLIC','signals':['PAYMENT_REQUEST','IDENTITY_UNVERIFIED']}
assert post('/v1/events',event)==201
assert post('/v1/consents/'+grant_id+'/revoke',{})==204
event['event_id']='test-'+uuid4().hex
assert post('/v1/events',event)==403
print('PASS: synthetic API happy-path + revocation fail closed')
