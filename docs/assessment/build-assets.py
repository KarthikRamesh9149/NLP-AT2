from pathlib import Path
import csv
from PIL import Image, ImageDraw, ImageFont
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
import subprocess
ROOT=Path(__file__).resolve().parent
A=ROOT/'assets'
REPO=ROOT.parents[1]/'formbridge'
G=HexColor('#203D35'); S=HexColor('#758965'); P=HexColor('#F1F4EC'); INK=HexColor('#26382F')
FONT='/System/Library/Fonts/Supplemental/Arial.ttf'
pdfmetrics.registerFont(TTFont('ReportSans',FONT))
pdfmetrics.registerFont(TTFont('ReportBold','/System/Library/Fonts/Supplemental/Arial Bold.ttf'))
Image.open(A/'product-home.jpg').crop((32,100,1248,344)).save(A/'cover-product.jpg',quality=96)
Image.open(A/'product-approved-full.jpg').crop((32,530,1248,1290)).save(A/'workspace-approved.jpg',quality=95)
left=Image.open(A/'product-uncertain-full.jpg').crop((705,907,1229,1110))
right=Image.open(A/'product-sources-full.jpg').crop((705,902,1229,1158))
mont=Image.new('RGB',(1100,326),'#F1F4EC')
dr=ImageDraw.Draw(mont);face=ImageFont.truetype(FONT,24)
dr.text((16,12),'A. Time still needs clarification',font=face,fill='#203D35')
dr.text((565,12),'B. Accepted time with linked sources',font=face,fill='#203D35')
mont.paste(left,(16,55));mont.paste(right,(564,55))
mont.save(A/'uncertainty-and-evidence.jpg',quality=96)
mobile=Image.open(A/'product-mobile-full.jpg')
mobile.crop((20,822,370,1670)).save(A/'mobile-brief.jpg',quality=95)

# Vector chart: derive values from the saved output, never from report prose.
with (REPO/'evaluation/results/assessment-summary.csv').open() as f: rows=list(csv.DictReader(f))
data={}
for r in rows:
 if 'equal-model' in r['file']:
  sample='Development (20 dialogues; 100 fields)' if 'dev-20' in r['file'] else 'Test remainder (13 dialogues; 65 fields)'
  data.setdefault(sample,{})[r['mode']]=100*int(r['canonicalCorrectFields'])/(int(r['dialogues'])*5)
c=canvas.Canvas(str(A/'comparison-chart.pdf'),pagesize=(950,340))
c.setFillColor(HexColor('#FFFFFF'));c.rect(0,0,950,340,fill=1,stroke=0)
colours={'rules':'#A3ACA3','model':'#698080','formbridge':'#203D35'}
for panel,(sample,values) in enumerate(data.items()):
 x0=45+panel*465; y0=45; width=310
 c.setFillColor(INK);c.setFont('ReportBold',15);c.drawString(x0,310,sample)
 c.setFont('ReportSans',12)
 for tick in (0,25,50,75,100):
  x=x0+88+width*tick/100
  c.setStrokeColor(HexColor('#DEE5DD'));c.line(x,y0+40,x,280)
  c.setFillColor(INK);c.drawCentredString(x,y0+13,str(tick))
 for i,(mode,label) in enumerate([('rules','Rules'),('model','Direct'),('formbridge','FormBridge')]):
  y=250-i*70;value=values[mode]
  c.setFillColor(INK);c.setFont('ReportSans',13);c.drawString(x0,y+6,label)
  c.setFillColor(HexColor(colours[mode]));c.roundRect(x0+88,y,width*value/100,24,3,fill=1,stroke=0)
  c.setFillColor(INK);c.setFont('ReportBold',13);c.drawString(x0+88+width*value/100+7,y+5,f'{value:.1f}%')
 c.setFillColor(INK);c.setFont('ReportSans',11);c.drawCentredString(x0+235,15,'Canonical field accuracy (%)')
c.save()

# Vector architecture drawing.
c=canvas.Canvas(str(A/'architecture.pdf'),pagesize=(1000,340))
c.setFillColor(HexColor('#FFFFFF'));c.rect(0,0,1000,340,fill=1,stroke=0)
def box(x,y,w,h,title,lines):
 c.setFillColor(P);c.setStrokeColor(HexColor('#C2D0BE'));c.roundRect(x,y,w,h,8,stroke=1,fill=1)
 c.setFillColor(G);c.setFont('ReportBold',15);c.drawString(x+14,y+h-25,title)
 c.setFont('ReportSans',12)
 for i,line in enumerate(lines):c.drawString(x+14,y+h-46-i*18,line)
def arrow(x,y,endx,endy):
 c.setStrokeColor(G);c.setLineWidth(1.7);c.line(x,y,endx,endy)
 if endx>x:c.line(endx,endy,endx-8,endy+4);c.line(endx,endy,endx-8,endy-4)
 else:c.line(endx,endy,endx-4,endy+8);c.line(endx,endy,endx+4,endy+8)
box(15,200,190,115,'Browser workspace',['Transcript + current brief','Staff edits + reference date'])
box(252,200,195,115,'Server contract',['Size + schema validation','Ordered visible prefix'])
box(495,200,215,115,'Contextual extraction',['Candidate values + status','Quotes + message IDs'])
box(755,200,225,115,'Evidence checks',['Value, acceptance, recency','Dates, times, cancellations'])
arrow(205,255,250,255);arrow(448,255,493,255);arrow(711,255,753,255)
box(530,30,210,110,'One optional repair',['Targeted validation feedback','Checked response or warning'])
box(765,30,215,110,'Reconcile + review',['History + staff overrides','Clarify, approve, download'])
arrow(868,200,868,145)
c.setFont('ReportSans',11);c.setFillColor(G);c.drawString(748,167,'checks applied')
arrow(740,86,763,86)
c.drawString(529,161,'Validation issue only')
c.setStrokeColor(S);c.line(850,200,850,155);c.line(850,155,635,155);c.line(635,155,635,143)
c.setFont('ReportSans',11);c.setFillColor(G);c.drawString(15,115,'The model proposes. Application code maintains the brief.')
c.drawString(15,94,'Gold labels and future messages are excluded from extraction.')
c.drawString(15,73,'The UI sends FormBridge mode; evaluation also runs rules and direct extraction.')
c.save()
pdftoppm='/Users/karthikramesh/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/override/pdftoppm'
for name in ['comparison-chart','architecture']:
 subprocess.run([pdftoppm,'-png','-r','160','-singlefile',str(A/(name+'.pdf')),str(A/name)],check=True)
print('Product images and vector figures ready.')
