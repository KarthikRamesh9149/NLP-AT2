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
REPO=next(parent for parent in ROOT.parents if (parent/'evaluation/results/assessment-summary.csv').exists()) if any((parent/'evaluation/results/assessment-summary.csv').exists() for parent in ROOT.parents) else ROOT.parents[1]/'formbridge'
G=HexColor('#203D35'); S=HexColor('#758965'); P=HexColor('#F1F4EC'); INK=HexColor('#26382F')
FONT='/System/Library/Fonts/Supplemental/Arial.ttf'
pdfmetrics.registerFont(TTFont('ReportSans',FONT))
pdfmetrics.registerFont(TTFont('ReportBold','/System/Library/Fonts/Supplemental/Arial Bold.ttf'))
Image.open(A/'product-home.jpg').crop((32,100,1248,344)).save(A/'cover-product.jpg',quality=96)
Image.open(A/'product-approved-full.jpg').crop((32,530,1248,1290)).save(A/'workspace-approved.jpg',quality=95)
Image.open(A/'product-approved-full.jpg').crop((705,680,1229,1280)).save(A/'booking-card-detail.jpg',quality=96)
Image.open(A/'product-sources-full.jpg').crop((705,902,1229,1158)).save(A/'accepted-time-detail.jpg',quality=96)
Image.open(A/'product-uncertain-full.jpg').crop((705,907,1229,1110)).save(A/'uncertain-time-detail.jpg',quality=96)
Image.open(A/'cancellation-fixed-live.png').crop((24,1350,413,1665)).convert('RGB').save(A/'cancellation-fixed-detail.jpg',quality=96)
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
  c.setFillColor(HexColor(colours[mode]));c.rect(x0+88,y,width*value/100,24,fill=1,stroke=0)
  c.setFillColor(INK);c.setFont('ReportBold',13);c.drawString(x0+88+width*value/100+7,y+5,f'{value:.1f}%')
 c.setFillColor(INK);c.setFont('ReportSans',11);c.drawCentredString(x0+235,15,'Canonical field accuracy (%)')
c.save()

# Conventional architecture schematic derived from the implemented pipeline.
c=canvas.Canvas(str(A/'architecture.pdf'),pagesize=(1000,325))
c.setFillColor(HexColor('#FFFFFF'));c.rect(0,0,1000,325,fill=1,stroke=0)
def box(x,y,w,h,title,lines):
 c.setFillColor(HexColor('#FFFFFF'));c.setStrokeColor(HexColor('#54605A'));c.setLineWidth(1)
 c.rect(x,y,w,h,stroke=1,fill=1)
 c.setFillColor(INK);c.setFont('ReportBold',15);c.drawString(x+13,y+h-25,title)
 c.setFont('ReportSans',12)
 for i,line in enumerate(lines):c.drawString(x+13,y+h-46-i*18,line)
def arrow(x,y,endx,endy):
 c.setStrokeColor(HexColor('#54605A'));c.setLineWidth(1.4);c.line(x,y,endx,endy)
 if endx>x:c.line(endx,endy,endx-8,endy+4);c.line(endx,endy,endx-8,endy-4)
 elif endx<x:c.line(endx,endy,endx+8,endy+4);c.line(endx,endy,endx+8,endy-4)
 elif endy<y:c.line(endx,endy,endx-4,endy+8);c.line(endx,endy,endx+4,endy+8)
 else:c.line(endx,endy,endx-4,endy-8);c.line(endx,endy,endx+4,endy-8)
box(15,205,190,100,'Conversation',['Customer/staff messages','Current brief + date context'])
box(250,205,195,100,'Server endpoint',['Request validation','Ordered conversation'])
box(490,205,215,100,'Model extraction',['Five candidate fields','Supporting quotations'])
box(750,205,230,100,'Validation feedback',['Check quoted support','Identify repairable issues'])
arrow(205,255,248,255);arrow(445,255,488,255);arrow(705,255,748,255)
box(515,25,220,105,'Optional repair',['One further model request','Checked first-pass fallback'])
box(15,25,425,105,'Update and review the brief',['Validate evidence, values and acceptance','Retain staff edits and revision history','Clarify unresolved details; approve and export'])
# Validation either uses the initial state or sends one bounded repair.
c.setFont('ReportSans',12);c.setFillColor(INK)
c.drawString(769,165,'Issue found')
c.setStrokeColor(HexColor('#54605A'));c.line(865,205,865,155);c.line(865,155,625,155)
arrow(625,155,625,132)
c.drawString(310,175,'No repair needed')
c.line(775,205,775,192);c.line(775,192,230,192)
arrow(230,192,230,132)
# Both original and repaired candidates pass through final evidence validation.
arrow(515,78,442,78)
c.save()
pdftoppm='/Users/karthikramesh/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/override/pdftoppm'
for name in ['comparison-chart','architecture']:
 subprocess.run([pdftoppm,'-png','-r','160','-singlefile',str(A/(name+'.pdf')),str(A/name)],check=True)
print('Product images and vector figures ready.')
