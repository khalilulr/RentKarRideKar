import grpc from 'k6/net/grpc';
import { check, sleep } from 'k6';

const client = new grpc.Client();
client.load(['libs/proto'], 'auth-service.proto');

export const options = {
  vus: 50,
  duration: '30s',
};

// If you are testing protected routes, put a valid test token here
const TEST_ACCESS_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5c...'; 
const TEST_USER_ID = 'user-uuid-1234';

export default () => {
  // 1. Connect to the service
  client.connect('localhost:50051', {
    plaintext: true
  });

  // =======================================================
  // API 1: SendOtp (Public Route)
  // =======================================================
  const otpResponse = client.invoke('auth.AuthService/SendOtp', { 
    mobile: '+918409253381' 
  });
  
  check(otpResponse, {
    'SendOtp status is OK': (r) => r && r.status === grpc.StatusOK,
  });

  // Short pause to simulate human delay between actions
  sleep(0.5);

  // =======================================================
  // API 2: GetAddresses (Protected Route)
  // =======================================================
  const addressResponse = client.invoke(
    'auth.AuthService/GetAddresses', 
    { userId: TEST_USER_ID }, // Request payload
    {
      // This is how you pass headers/metadata in gRPC!
      metadata: { Authorization: `Bearer ${TEST_ACCESS_TOKEN}` } 
    }
  );

  check(addressResponse, {
    'GetAddresses status is OK': (r) => r && r.status === grpc.StatusOK,
    'GetAddresses returned array': (r) => r && r.message && Array.isArray(r.message.addresses),
  });

  sleep(0.5);

  // =======================================================
  // API 3: CheckTrustedDriver (Internal/Protected Route)
  // =======================================================
  const driverResponse = client.invoke(
    'auth.AuthService/CheckTrustedDriver', 
    { 
      ownerId: TEST_USER_ID, 
      driverId: 'driver-uuid-5678' 
    },
    {
      metadata: { Authorization: `Bearer ${TEST_ACCESS_TOKEN}` }
    }
  );

  check(driverResponse, {
    'CheckTrustedDriver status is OK': (r) => r && r.status === grpc.StatusOK,
  });

  // Close connection at the end of the user journey
  client.close();
  
  // Pause before this virtual user starts the loop over again
  sleep(1); 
};