import csv
import random

locations = [
    ("India", "Rajasthan", "Jaipur", "Jaipur", "Mansarovar"),
    ("India", "Rajasthan", "Jaipur", "Jaipur", "Malviya Nagar"),
    ("India", "Rajasthan", "Jodhpur", "Jodhpur", "Sardarpura"),
    ("India", "Delhi", "New Delhi", "New Delhi", "Connaught Place")
]

first_names = ["Aarav", "Vihaan", "Aditya", "Arjun", "Sai", "Riaan", "Krishna", "Ishaan", "Shaurya", "Atharv",
               "Saanvi", "Aanya", "Aadhya", "Aaradhya", "Ananya", "Pari", "Diya", "Navya", "Myra", "Anika",
               "Karan", "Rahul", "Ravi", "Amit", "Suresh", "Ramesh", "Deepak", "Vikas", "Sunil", "Pooja",
               "Neha", "Kavita", "Geeta", "Sunita", "Anita", "Ritu", "Meena", "Seema", "Rekha", "Sushma"]

last_names = ["Sharma", "Verma", "Kumar", "Singh", "Gupta", "Mishra", "Patel", "Joshi", "Yadav", "Chauhan",
              "Rajput", "Agarwal", "Bansal", "Mehta", "Desai", "Rao", "Nair", "Pillai", "Reddy", "Iyer"]

with open("/run/media/lucifer/New Volume/Office Work/cms/dummy_end_users.csv", "w", newline="") as f:
    writer = csv.writer(f)
    writer.writerow(["name", "mobile", "email", "aadhar", "pan_card", "country", "state", "district", "city", "area"])
    
    for i in range(1, 101):
        name = f"{random.choice(first_names)} {random.choice(last_names)}"
        mobile = f"98765{i:05d}"
        email = f"user{i}@example.com"
        
        aadhar_base = f"{i:04d}" * 3
        aadhar = aadhar_base[:12]
        
        # PAN format: 5 letters, 4 digits, 1 letter
        pan_alpha = "ABCDE"
        pan_num = f"{i:04d}"
        pan_card = f"{pan_alpha}{pan_num}X"
        
        loc = random.choice(locations)
        writer.writerow([name, mobile, email, aadhar, pan_card, loc[0], loc[1], loc[2], loc[3], loc[4]])
