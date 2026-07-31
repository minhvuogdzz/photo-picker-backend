async function test() {
  try {
    const loginRes = await fetch('http://localhost:3000/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'admin',
        password: 'admin88', // assuming admin uses admin/admin now based on recent login page default
        deviceFingerprint: 'test-script',
        force: true
      })
    });
    const loginData = await loginRes.json();
    const token = loginData.data?.accessToken;
    console.log("Logged in. Token:", token ? "OK" : "FAIL");
    if (!token) {
      console.log(loginData);
      return;
    }

    const usersRes = await fetch('http://localhost:3000/admin/users', {
      headers: { Authorization: `Bearer ${token}` }
    });
    const usersData = await usersRes.json();
    console.log("Users API Response:", usersData);
    
    // In this API, usersData is already the array, or usersData.data is the array
    const users = Array.isArray(usersData) ? usersData : usersData.data;
    
    if (!users || !Array.isArray(users)) {
      console.log("Failed to parse users array");
      return;
    }
    const targetUser = users.find((u: any) => u.role !== 'ADMIN');
    if (!targetUser) {
      console.log("No normal users found.");
      return;
    }

    console.log(`Targeting user: ${targetUser.email} (ID: ${targetUser.id})`);

    // Set expiration to 5 seconds from now
    const expiresAt = new Date(Date.now() + 5000).toISOString();
    
    const updateRes = await fetch(`http://localhost:3000/admin/users/${targetUser.id}/subscription`, {
      method: 'POST',
      headers: { 
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        status: 'ACTIVE',
        expiresAt: expiresAt
      })
    });
    const updateData = await updateRes.json();
    console.log("Update response:", updateData);
    console.log("Subscription updated to expire in 5 seconds:", updateData.success ? "OK" : "FAIL");

  } catch (e) {
    console.error(e);
  }
}
test();
