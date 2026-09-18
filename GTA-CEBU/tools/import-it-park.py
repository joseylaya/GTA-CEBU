"""Convert an OSM API XML extract to a small, attributed game geography snapshot.
Usage: python3 tools/import-it-park.py path/to/extract.osm
The derived geographic data remains available under ODbL 1.0.
"""
import json, math, sys, pathlib, xml.etree.ElementTree as ET

ROOT=pathlib.Path(__file__).resolve().parents[1]
ORIGIN=(10.33005,123.9069)
HALF_X,HALF_Z=350,440
def project(lat,lon):
    return [round((lon-ORIGIN[1])*111320*math.cos(math.radians(ORIGIN[0])),2),round((ORIGIN[0]-lat)*110540,2)]
def inside(p,margin=0):return abs(p[0])<HALF_X-margin and abs(p[1])<HALF_Z-margin
def tags(e):return {t.get('k'):t.get('v') for t in e.findall('tag')}
def clip(a,b):
    dx,dz=b[0]-a[0],b[1]-a[1];lo,hi=0,1
    for p,q in [(-dx,a[0]+HALF_X-4),(dx,HALF_X-4-a[0]),(-dz,a[1]+HALF_Z-4),(dz,HALF_Z-4-a[1])]:
        if abs(p)<1e-8:
            if q<0:return None
        else:
            t=q/p
            if p<0:lo=max(lo,t)
            else:hi=min(hi,t)
            if lo>hi:return None
    return [[round(a[0]+dx*lo,2),round(a[1]+dz*lo,2)],[round(a[0]+dx*hi,2),round(a[1]+dz*hi,2)]]
def area(ps):return abs(sum(a[0]*b[1]-b[0]*a[1] for a,b in zip(ps,ps[1:]+ps[:1])))/2
root=ET.parse(sys.argv[1]).getroot()
nodes={n.get('id'):project(float(n.get('lat')),float(n.get('lon'))) for n in root.findall('node')}
roads=[];buildings=[];parks=[];trees=[];places=[]
drive={'primary','secondary','tertiary','unclassified','residential','service','living_street','primary_link','secondary_link','tertiary_link'}
walk={'footway','pedestrian','path','steps'}
for w in root.findall('way'):
    t=tags(w);ps=[nodes[n.get('ref')] for n in w.findall('nd') if n.get('ref') in nodes]
    if len(ps)<2:continue
    highway=t.get('highway')
    if highway in drive|walk and t.get('access')!='private' and t.get('tunnel')!='yes' and t.get('bridge')!='yes':
        width={'primary':13,'secondary':12,'tertiary':10,'unclassified':9,'residential':8,'service':6}.get(highway,3)
        try:width=max(3,min(16,float(t.get('width',width))))
        except ValueError:pass
        segments=[s for a,b in zip(ps,ps[1:]) if (s:=clip(a,b)) and math.dist(*s)>.3]
        if segments:roads.append({'id':int(w.get('id')),'name':t.get('name','Access lane' if highway=='service' else 'Walkway'),'kind':highway,'width':width,'walk':highway in walk,'oneway':t.get('oneway','no'),'segments':segments})
    if ps[0]!=ps[-1]:continue
    ps=ps[:-1]
    if len(ps)<3 or not all(inside(p,2) for p in ps):continue
    center=[sum(p[0] for p in ps)/len(ps),sum(p[1] for p in ps)/len(ps)]
    building=t.get('building:part',t.get('building'))
    if building and building not in {'roof','construction'} and area(ps)>25:
        levels=t.get('building:levels','');height=t.get('height','')
        try:h=float(height.split()[0]) if height else float(levels)*3.25
        except (ValueError,IndexError):h=22 if t.get('building') in {'commercial','office','apartments'} else 8
        name=t.get('name','')
        if name=='Central Bloc Corporate Center One':h=54
        if name=='Central Bloc Corporate Center Two':h=70
        if name=='Seda Hotel':h=54
        buildings.append({'id':int(w.get('id')),'name':name,'kind':building,'height':round(max(4,min(165,h)),1),'points':ps})
    if t.get('leisure') in {'park','garden','playground'} or t.get('landuse') in {'grass','forest','recreation_ground'}:
        parks.append({'id':int(w.get('id')),'name':t.get('name','Green space'),'points':ps})
for n in root.findall('node'):
    p=nodes[n.get('id')];t=tags(n)
    if not inside(p,5):continue
    if t.get('natural')=='tree':trees.append(p)
    if t.get('name') and (t.get('amenity') in {'cafe','restaurant','fast_food','bank','bus_station','pharmacy','food_court'} or t.get('shop') or t.get('office')):
        places.append({'id':int(n.get('id')),'name':t['name'],'kind':t.get('amenity',t.get('shop',t.get('office'))),'point':p})
data={'meta':{'name':'Cebu IT Park','origin':{'lat':ORIGIN[0],'lon':ORIGIN[1]},'halfX':HALF_X,'halfZ':HALF_Z,'units':'meters; x east, z south','retrieved':'2026-09-17','source':'https://api.openstreetmap.org/api/0.6/map?bbox=123.903,10.3245,123.911,10.3335','attribution':'© OpenStreetMap contributors','license':'https://opendatacommons.org/licenses/odbl/1.0/','note':'Street and footprint geometry from OSM; heights without source tags are illustrative.'},'roads':roads,'buildings':buildings,'parks':parks,'trees':trees,'places':places}
for output in [ROOT/'src/data/it-park.json',ROOT/'public/data/cebu-it-park.json']:
    output.write_text(json.dumps(data,separators=(',',':'))+'\n')
print({k:len(data[k]) for k in ['roads','buildings','parks','trees','places']})
