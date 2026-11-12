declare module 'zipcodes' {
  type Zip = {
    zip: string;
    city: string;
    state: string;
    country: string;
    latitude: number;
    longitude: number;
  };
  const data: {
    lookupByCoords(lat: number, lng: number): Zip | undefined;
    /** Every ZIP code in a state, by its two-letter code. */
    lookupByState(state: string): Zip[];
  };
  export default data;
}
