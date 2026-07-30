async function test() {
  try {
    const loginRes = await fetch('http://localhost:3000/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'admin',
        password: 'admin88',
        deviceFingerprint: 'test'
      })
    });
    const loginData = await loginRes.json();
    const token = loginData.data?.accessToken || loginData.accessToken;
    console.log("TOKEN:", token);

    const dashRes = await fetch('http://localhost:3000/admin/dashboard', {
      headers: { Authorization: `Bearer ${token}` }
    });
    const dash = await dashRes.json();
    console.log("DASHBOARD:", JSON.stringify(dash, null, 2));

    const usersRes = await fetch('http://localhost:3000/admin/users', {
      headers: { Authorization: `Bearer ${token}` }
    });
    const users = await usersRes.json();
    console.log("USERS:", JSON.stringify(users, null, 2));
  } catch (e) {
    console.error(e);
  }
}
test();
