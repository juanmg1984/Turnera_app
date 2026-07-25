import pandas as pd
import sqlite3
import uuid

def generate_id():
    return str(uuid.uuid4())

def main():
    print("Reading Excel file for Abastecedoras...")
    df = pd.read_excel('datos_pad/aerovalesDesde01-01-2026al23-07-2026.xlsx')
    
    conn = sqlite3.connect('turnera.db')
    cur = conn.cursor()
    
    # We will get the first occurrence of each Abastecedora to guess its fuel grade
    ab_df = df.drop_duplicates(subset=['Abastecedora']).dropna(subset=['Abastecedora'])
    
    count = 0
    for _, row in ab_df.iterrows():
        nombre = str(row['Abastecedora']).strip().upper()
        
        # Skip invalid ones or surtidores
        if not nombre or nombre == '-' or 'SURTIDOR' in nombre:
            continue
            
        cur.execute("SELECT id FROM abastecedoras WHERE nombre = ?", (nombre,))
        if cur.fetchone():
            continue # already exists
            
        # Determine fuel grade
        producto = str(row['Producto']).upper()
        if '100' in producto or 'AVGAS' in producto:
            grado = 'AVGAS 100LL'
        else:
            grado = 'JET A-1'
            
        cid = generate_id()
        cur.execute("""
            INSERT INTO abastecedoras (id, nombre, grado, capacidad, activa)
            VALUES (?, ?, ?, 0, 1)
        """, (cid, nombre, grado))
        count += 1
        
    conn.commit()
    conn.close()
    print(f"Database seeded successfully! Added {count} abastecedoras.")

if __name__ == '__main__':
    main()
