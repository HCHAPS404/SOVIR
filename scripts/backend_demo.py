#!/usr/bin/env python3
"""Exercise a RUNNING SOVIR local API. Does not launch cargo; sends synthetic metadata only."""
import json
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone
from uuid import uuid4
URL='http://127.0.0.1:8787'
now=int(datetime.now(timezone.utc).timestamp()*1000)
def get(path,token):
    req=urllib.request.Request(URL+path, headers={'authorization':'Bearer '+token})
    try:
        with urllib.request.urlopen(req,timeout=5) as response:
            return response.status, json.loads(response.read())
    except urllib.error.HTTPError as e:
        return e.code, {}
def post(path,obj,token=None):
    headers={'content-type':'application/json'}
    if token: headers['authorization']='Bearer '+token
    req=urllib.request.Request(URL+path, json.dumps(obj).encode(), headers, method='POST')
    try:
        with urllib.request.urlopen(req,timeout=5) as response:
            data=response.read()
            print(path,'HTTP',response.status, data.decode() if data else '')
            return response.status, json.loads(data) if data else {}
    except urllib.error.HTTPError as e:
        body=e.read().decode()
        print(path,'HTTP',e.code,body)
        try: parsed=json.loads(body)
        except ValueError: parsed={}
        return e.code, parsed

# Dev sessions are the auth path: mint one, then use it as the bearer token.
status,session=post('/v1/auth/dev-session',{'principal_id':'demo-user','device_id':'demo-device'})
assert status==201, 'dev-session failed (SOVIR_ENV must be local|test)'
token=session['token']

grant_id='test-'+uuid4().hex
source='browser.synthetic'
assert post('/v1/consents',{'grant_id':grant_id,'source_id':source,'expires_at_ms':now+3600000},token)[0]==201
event={'event_id':'test-'+uuid4().hex,'source_id':source,'observed_at_ms':now,
 'modality':'URL','content_digest':'sha256:synthetic-digest-only','consent_grant_id':grant_id,
 'sensitive_data_class':'PUBLIC','signals':['PAYMENT_REQUEST','IDENTITY_UNVERIFIED']}
assert post('/v1/events',event,token)[0]==201
# warn decision enqueued an intervention; dispatch delivers it once.
status,items=get('/v1/interventions',token)
assert status==200 and len(items)==1 and items[0]['kind']=='warn_banner', items
status,res=post('/v1/interventions/dispatch',{},token)
assert status==200 and res['delivered']==1, res
status,items=get('/v1/interventions',token)
assert items[0]['state']=='delivered' and items[0]['attempts']==1, items
assert post('/v1/consents/'+grant_id+'/revoke',{},token)[0]==204
event['event_id']='test-'+uuid4().hex
assert post('/v1/events',event,token)[0]==403
# A foreign session cannot consume a grant bound to another principal+device.
grant2='test-'+uuid4().hex
assert post('/v1/consents',{'grant_id':grant2,'source_id':source,'expires_at_ms':now+3600000},token)[0]==201
status,foreign=post('/v1/auth/dev-session',{'principal_id':'other-user','device_id':'other-device'})
assert status==201
foreign_event=dict(event,event_id='test-'+uuid4().hex,consent_grant_id=grant2)
assert post('/v1/events',foreign_event,foreign['token'])[0]==403
assert post('/v1/auth/logout',{},token)[0]==204
assert post('/v1/events',foreign_event,token)[0]==401
# Data governance: export returns the principal's records; purge erases them
# and revokes the caller's sessions (fail closed afterwards).
status,s3=post('/v1/auth/dev-session',{'principal_id':'erase-me','device_id':'d3'})
assert status==201
t3=s3['token']
g3='test-'+uuid4().hex
assert post('/v1/consents',{'grant_id':g3,'source_id':source,'expires_at_ms':now+3600000},t3)[0]==201
assert post('/v1/events',dict(event,event_id='test-'+uuid4().hex,consent_grant_id=g3),t3)[0]==201
status,data=get('/v1/me/data',t3)
assert status==200 and len(data['events'])==1 and len(data['grants'])==1, data
import urllib.request as _r
req=_r.Request(URL+'/v1/me/data',headers={'authorization':'Bearer '+t3},method='DELETE')
with _r.urlopen(req,timeout=5) as resp:
    report=json.loads(resp.read()); print('/v1/me/data DELETE HTTP',resp.status,report)
assert report['events_deleted']==1 and report['grants_deleted']==1
assert post('/v1/events',dict(event,event_id='test-'+uuid4().hex,consent_grant_id=g3),t3)[0]==401
print('PASS: synthetic API happy-path + revocation + binding + logout + data erasure fail closed')
